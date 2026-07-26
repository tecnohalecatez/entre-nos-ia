// Controller (client side) of the Service_Worker_App update lifecycle. See
// .kiro/specs/asistente-ia-local/design.md (section "Service_Worker_App")
// and requirements.md (Requisito 9) for the design detail.
//
// Deliberately kept separate from `registerServiceWorker.ts` (which imports
// the virtual module `virtual:pwa-register` injected by Vite at build time)
// so that this decision logic is importable and testable in Vitest without
// depending on that virtual module.

import type { GenerationState } from "../inference-engine/reduceGeneration";

/**
 * PURE function: determines whether it is safe to apply the pending
 * Service_Worker_App update right now, per Requisitos 9.4 and 9.5 (the
 * reload associated with activating a new version is deferred while the
 * Motor_Inferencia is generating a response).
 */
export function canUpdateNow(state: GenerationState): boolean {
  return state.type !== "generating";
}

export type UpdateRequestResult = "applied" | "deferred";

/** Stateful controller (is there a deferred update?) for the SW update lifecycle. */
export interface ServiceWorkerUpdateController {
  /** Re-exports `canUpdateNow` for the caller's convenience (e.g. disabling a button). */
  canUpdateNow(state: GenerationState): boolean;
  /**
   * The user accepted the available update from the notification (9.2).
   * If there is no generation in progress, sends `postMessage({type: "SKIP_WAITING"})`
   * immediately and returns `"applied"`. If there is a generation in progress
   * (9.5), does not send the message yet and returns `"deferred"`: the update
   * will be applied automatically on the next call to
   * `notifyGenerationStateChange` where `canUpdateNow` is `true`.
   */
  requestUpdate(state: GenerationState): UpdateRequestResult;
  /**
   * Must be invoked every time the application's `GenerationState` changes.
   * If there is a deferred update and the new state already allows applying
   * it, applies it (sends the deferred `postMessage`) and clears the
   * deferral (9.4, 9.5).
   */
  notifyGenerationStateChange(state: GenerationState): void;
}

/**
 * Creates a `ServiceWorkerUpdateController`.
 *
 * @param sendSkipWaiting Side effect that sends
 *   `postMessage({type: "SKIP_WAITING"})` to the waiting Service Worker
 *   (in production, the `updateServiceWorker` function returned by
 *   `registerSW()` from `virtual:pwa-register`). Injected to keep this
 *   module testable without a real Service Worker.
 */
export function createUpdateController(
  sendSkipWaiting: () => void,
): ServiceWorkerUpdateController {
  let updatePending = false;

  function requestUpdate(state: GenerationState): UpdateRequestResult {
    if (canUpdateNow(state)) {
      updatePending = false;
      sendSkipWaiting();
      return "applied";
    }

    updatePending = true;
    return "deferred";
  }

  function notifyGenerationStateChange(state: GenerationState): void {
    if (updatePending && canUpdateNow(state)) {
      updatePending = false;
      sendSkipWaiting();
    }
  }

  return { canUpdateNow, requestUpdate, notifyGenerationStateChange };
}
