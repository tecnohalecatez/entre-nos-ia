// UpdateAvailableNotification: connects detection of a new version of the
// Service_Worker_App with the centralized notification mechanism and with
// the update lifecycle controller (task 19.2).
//
// See .kiro/specs/asistente-ia-local/design.md (section "Service_Worker_App")
// and requirements.md (Requisito 9) for the design detail.
//
// Requirements covered:
// - 9.1: on detecting a new version (`onNeedRefresh`, see
//   `registerServiceWorker.ts`), a visible notification is published in the
//   Interfaz_Chat via `useNotification()`. The centralized notification
//   mechanism (`Notification`/`NotificationProvider`, task 16.2) has no
//   auto-dismiss timer: a published notification stays on screen until
//   `dismissNotification()` is invoked, either from the generic "x" button
//   (explicit dismissal) or from this component's own "Actualizar" action
//   `onClick` (acceptance), satisfying "visible until explicit
//   acceptance/dismissal" with no extra logic.
// - 9.2: clicking "Actualizar" invokes
//   `controller.requestUpdate(generationState)`
//   (`createUpdateController`, task 9.6), which sends the deferred
//   `postMessage({type: "SKIP_WAITING"})` immediately if there is no
//   generation in progress, or defers it until it finishes (9.4, 9.5).
// - 9.6: if the user dismisses the notification (the "x" button) or simply
//   does not respond, `requestUpdate()` is never called, so the application
//   keeps using the current version without interruption.
//
// Registration of the Service_Worker_App (previously done at module level
// in `main.tsx`) is done here, inside the React tree, because
// `onNeedRefresh` needs access to `useNotification()` and to
// `useAppState()` (to read `GenerationState` at the moment of the click on
// "Actualizar"), both only available as React context.

import { useEffect, useRef } from "react";
import {
  registerServiceWorker as registerServiceWorkerDefault,
  type SendSkipWaiting,
  type RegisterServiceWorkerCallbacks,
} from "./registerServiceWorker";
import {
  createUpdateController as createUpdateControllerDefault,
  type ServiceWorkerUpdateController,
} from "./serviceWorkerUpdateController";
import { useNotification } from "../notification/useNotification";
import { useAppState } from "../app-state/useAppState";
import type { GenerationState } from "../inference-engine/reduceGeneration";

const UPDATE_AVAILABLE_TEXT = "Hay una actualización disponible";
const UPDATE_ACTION_LABEL = "Actualizar";

export interface UpdateAvailableNotificationProps {
  /** Injectable for tests: avoids depending on the `virtual:pwa-register` virtual module. */
  registerServiceWorkerFn?: (
    callbacks: RegisterServiceWorkerCallbacks,
  ) => SendSkipWaiting | undefined;
  /** Injectable for tests. */
  createUpdateControllerFn?: (
    sendSkipWaiting: SendSkipWaiting,
  ) => ServiceWorkerUpdateController;
}

/**
 * Minimal indirection over `AbortSignal.aborted`, analogous to the one used
 * in `AppStateProvider.tsx`: isolates the read so TypeScript does not treat
 * it as always `false` inside the closure where the `AbortController` is
 * created.
 */
function isCancelled(signal: AbortSignal): boolean {
  return signal.aborted;
}

/**
 * Component with no rendering of its own (always returns `null`): its sole
 * responsibility is wiring the side effects between Service_Worker_App
 * registration, the notification mechanism, and the application's
 * `GenerationState`. Must be mounted exactly once, near the root, inside
 * `NotificationProvider` and `AppStateProvider`, and stay active regardless
 * of whether Modo_Degradado is active (an update can be detected even in
 * that state).
 */
export function UpdateAvailableNotification({
  registerServiceWorkerFn = registerServiceWorkerDefault,
  createUpdateControllerFn = createUpdateControllerDefault,
}: UpdateAvailableNotificationProps = {}) {
  const { showNotification } = useNotification();
  const { generationState } = useAppState();

  // Kept in a ref (instead of relying on the closure created in
  // `onNeedRefresh`) so the "Actualizar" action's `onClick` always reads the
  // current `GenerationState` at the moment of the click, no matter how much
  // time (or how many generations) has passed since the notification was shown.
  const generationStateRef = useRef<GenerationState>(generationState);
  useEffect(() => {
    generationStateRef.current = generationState;
  }, [generationState]);

  const controllerRef = useRef<ServiceWorkerUpdateController | null>(null);

  useEffect(() => {
    const abortController = new AbortController();

    function handleNeedRefresh(): void {
      if (isCancelled(abortController.signal)) {
        return;
      }
      showNotification({
        type: "info",
        text: UPDATE_AVAILABLE_TEXT,
        action: {
          label: UPDATE_ACTION_LABEL,
          onClick: () => {
            controllerRef.current?.requestUpdate(generationStateRef.current);
          },
        },
      });
    }

    const sendSkipWaiting = registerServiceWorkerFn({
      onNeedRefresh: handleNeedRefresh,
    });

    if (sendSkipWaiting !== undefined && !isCancelled(abortController.signal)) {
      controllerRef.current = createUpdateControllerFn(sendSkipWaiting);
    }

    return () => {
      abortController.abort();
    };
    // Registered exactly once on mount: `registerServiceWorkerFn` and
    // `createUpdateControllerFn` are stable injections (by default, module
    // functions) and `showNotification` is stable (memoized by
    // `NotificationProvider`).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 9.4, 9.5: if an update was accepted while a response was being
  // generated, it is applied automatically as soon as generation finishes.
  useEffect(() => {
    controllerRef.current?.notifyGenerationStateChange(generationState);
  }, [generationState]);

  return null;
}
