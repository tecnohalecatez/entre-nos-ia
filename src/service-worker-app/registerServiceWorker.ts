// Registration of the Service_Worker_App (Requisito 3.1) and handling of
// registration/asset-caching failure (3.3): if registration fails, the
// application must keep working with direct network requests and inform the
// user that offline mode is not available.
//
// The full update lifecycle (Requisito 9): the persistent update-available
// notification is wired up in task 19.2 on top of the `onNeedRefresh`
// callback exposed here; the decision to defer activation until the user
// accepts and until `GenerationState.type !== "generating"` lives in
// `serviceWorkerUpdateController.ts` (task 9.6), which consumes the
// `sendSkipWaiting` function returned by `registerServiceWorker` to send
// `postMessage({type: "SKIP_WAITING"})` to the waiting Service Worker.
//
// The page reload once the new version takes control: `vite-plugin-pwa`
// (`workbox-window` under the hood) reloads the page ITSELF, unconditionally,
// unless `onNeedReload` is provided (see
// `node_modules/vite-plugin-pwa/dist/client/build/register.js`,
// `showSkipWaitingPrompt()`'s `controlling` handler). Crucially, that
// listener is armed by the `waiting` event -- not by the user accepting the
// update -- and its `isUpdate` flag just means "this tab was already
// controlled by a Service Worker", which is true on effectively every visit
// after the first install. The practical effect: with a new version merely
// sitting in `waiting`, ANY `controllerchange` (another tab accepting the
// update, the browser reclaiming a stale worker, ...) reloads THIS tab too,
// mid-conversation, without this tab's user having clicked anything. So
// `onNeedReload` IS provided below, specifically to take that reload back
// under this module's control and gate it on `sendSkipWaiting()` having
// actually been invoked in THIS tab (i.e. the user accepted the update
// here, or `serviceWorkerUpdateController.ts` applied a deferred one once
// generation finished) -- see `updateAcceptedInThisTab` below.

import { registerSW } from "virtual:pwa-register";
import { markReloadReason } from "../app-state/sessionDiagnostics";

export interface RegisterServiceWorkerCallbacks {
  /** Invoked when a new version has been downloaded and is waiting for activation (9.1). */
  onNeedRefresh?: () => void;
  /** Invoked when registration or the initial asset caching fails (3.3). */
  onRegistrationFailed?: (error: unknown) => void;
}

/**
 * Side effect that sends `postMessage({type: "SKIP_WAITING"})` to the
 * waiting Service Worker. Returned by `registerServiceWorker` so the caller
 * (typically `createUpdateController`, task 9.6) invokes it only when the
 * user accepts the update and there is no generation in progress.
 */
export type SendSkipWaiting = () => void;

/**
 * Registers the Service_Worker_App if the browser supports it. Does not
 * throw: on any registration failure it invokes `onRegistrationFailed` so
 * the caller can inform the user and continue with direct network requests.
 *
 * Returns the `sendSkipWaiting` function that applies the pending update
 * (9.2); if the browser does not support Service Worker or registration
 * fails, returns `undefined` (there is no update to apply).
 *
 * @param reload The actual reload side effect, invoked only after this
 *   tab's own `sendSkipWaiting()` was called (see file header). Injectable
 *   for tests, which cannot exercise a real `window.location.reload()`
 *   (jsdom does not implement navigation); defaults to the real thing.
 */
export function registerServiceWorker(
  callbacks: RegisterServiceWorkerCallbacks = {},
  reload: () => void = () => {
    window.location.reload();
  },
): SendSkipWaiting | undefined {
  if (!("serviceWorker" in navigator)) {
    callbacks.onRegistrationFailed?.(new Error("The browser does not support Service Worker"));
    return undefined;
  }

  // Set only once THIS tab has actually asked to apply the update (see
  // `sendSkipWaiting` below), so `onNeedReload` can tell "I asked for this"
  // apart from "some other tab/worker changed the controller out from under
  // me" (see file header).
  let updateAcceptedInThisTab = false;

  try {
    const updateServiceWorker = registerSW({
      immediate: true,
      onNeedRefresh() {
        callbacks.onNeedRefresh?.();
      },
      onNeedReload() {
        if (!updateAcceptedInThisTab) {
          // Another tab (or the browser itself) took control without this
          // tab's consent. Deliberately do NOT reload: this tab keeps
          // running its current JS -- stale, but not mid-conversation data
          // loss -- until the next natural navigation picks up the new
          // version.
          return;
        }
        markReloadReason("sw-update");
        reload();
      },
      onRegisterError(error: unknown) {
        callbacks.onRegistrationFailed?.(error);
      },
    });

    return () => {
      updateAcceptedInThisTab = true;
      void updateServiceWorker();
    };
  } catch (error) {
    callbacks.onRegistrationFailed?.(error);
    return undefined;
  }
}
