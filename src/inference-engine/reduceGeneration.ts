// Pure state machine of the InferenceEngine's response generation cycle.
// See .kiro/specs/asistente-ia-local/design.md (section "Motor_Inferencia") for
// design detail and Property 5 ("Transiciones de estado de generación de
// respuesta") which undergoes property-based testing in task 5.2.

import type { Message } from "../types/models";

/** State of the assistant response generation state machine. */
export type GenerationState =
  | { type: "idle" }
  | { type: "generating"; userMessage: Message; partialText: string }
  | { type: "completed"; userMessage: Message; assistantMessage: Message }
  | { type: "cancelled"; userMessage: Message; retainedPartialText: string }
  | { type: "error"; userMessage: Message; error: string };

/** Event that can occur during a response's generation. */
export type GenerationEvent =
  | { type: "start"; userMessage: Message }
  | { type: "chunk"; text: string }
  | { type: "complete" }
  | { type: "cancel" }
  | { type: "error"; reason: string };

/**
 * PURE transition function of the generation state machine.
 * Subjected to property-based testing (Property 5, task 5.2).
 *
 * `"start"` is the only transition applied independently of the current
 * state: it (re)starts the generation cycle for `userMessage`, with an
 * empty `partialText`. It's the necessary counterpart of the three terminal
 * events (it allows re-entering `"generating"` after `"idle"`, `"completed"`,
 * `"cancelled"` or `"error"` — e.g. when sending a new Message or retrying
 * after an error, Requisito 8.2) and is not part of Property 5 (which only
 * concerns transitions FROM `"generating"`).
 *
 * The rest of the rules (derived from Requisitos 4.3, 4.5 and 8.2) only
 * apply from the `"generating"` state:
 * - `"chunk"`: accumulates the text in `partialText`, remains in `"generating"`.
 * - `"complete"`: transitions to `"completed"` with a new `assistantMessage`
 *   whose `content` is exactly the accumulated `partialText`.
 * - `"cancel"`: transitions to `"cancelled"`, preserving exactly the
 *   accumulated `partialText` as `retainedPartialText`.
 * - `"error"`: transitions to `"error"`, discarding the accumulated
 *   `partialText` (it does not appear in the resulting state).
 *
 * In all three terminal cases, `userMessage` remains present and unmodified.
 * Any other event received outside the `"generating"` state has no effect
 * (the same state is returned), following the usual pure reducer pattern.
 */
export function reduceGeneration(
  state: GenerationState,
  event: GenerationEvent,
): GenerationState {
  if (event.type === "start") {
    return {
      type: "generating",
      userMessage: event.userMessage,
      partialText: "",
    };
  }

  if (state.type !== "generating") {
    return state;
  }

  switch (event.type) {
    case "chunk":
      return {
        ...state,
        partialText: state.partialText + event.text,
      };

    case "complete": {
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: state.partialText,
        timestamp: Date.now(),
      };
      return {
        type: "completed",
        userMessage: state.userMessage,
        assistantMessage,
      };
    }

    case "cancel":
      return {
        type: "cancelled",
        userMessage: state.userMessage,
        retainedPartialText: state.partialText,
      };

    case "error":
      return {
        type: "error",
        userMessage: state.userMessage,
        error: event.reason,
      };

    default:
      return state;
  }
}
