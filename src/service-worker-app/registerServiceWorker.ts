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
// The page reload once the new version takes control is already handled by
// `vite-plugin-pwa`/`workbox-window` by default (`controlling` event fired
// after `skipWaiting()`; see
// `node_modules/vite-plugin-pwa/dist/client/build/register.js`): there is no
// need to implement that reload manually in this module.

import { registerSW } from "virtual:pwa-register";

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
 */
export function registerServiceWorker(
  callbacks: RegisterServiceWorkerCallbacks = {},
): SendSkipWaiting | undefined {
  if (!("serviceWorker" in navigator)) {
    callbacks.onRegistrationFailed?.(new Error("The browser does not support Service Worker"));
    return undefined;
  }

  try {
    const updateServiceWorker = registerSW({
      immediate: true,
      onNeedRefresh() {
        callbacks.onNeedRefresh?.();
      },
      onRegisterError(error: unknown) {
        callbacks.onRegistrationFailed?.(error);
      },
    });

    return () => {
      void updateServiceWorker();
    };
  } catch (error) {
    callbacks.onRegistrationFailed?.(error);
    return undefined;
  }
}
