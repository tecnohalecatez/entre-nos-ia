// useSendMessage: orchestration hook for the Chat_Interface's full
// Message-send flow (task 22.1).
//
// Connects the pieces built in earlier tasks: validation (already done by
// `MessageInput` before invoking `onSend`, task 17.3) -> creating a
// Conversation if none exists (4.9) -> invoking the Inference_Engine (4.1)
// -> incremental streaming to `MessageHistory` via `generationState` (4.2)
// -> persisting the user and assistant Message (5.1) -> `reduceGeneration`
// transition on complete/cancel/error (4.3, 4.5, 8.2) -> explicit retry
// after error (8.2).
//
// See .kiro/specs/asistente-ia-local/design.md ("Motor_Inferencia",
// Property 5) and requirements.md (4.1, 4.2, 4.3, 4.5, 4.9, 5.1, 8.2).
//
// Relevant design decisions:
//
// 1. How the "generating" state is entered: `reduceGeneration` originally
//    only defined transitions FROM "generating" (Property 5, task 5.2). To
//    be able to (re)start the cycle -- both when sending a new Message and
//    when retrying after an error -- the `"start"` event was added to
//    `GenerationEvent` (see `reduceGeneration.ts`), which transitions to
//    "generating" with empty `partialText` from any state. It's not part of
//    Property 5, which only concerns transitions FROM "generating".
//
// 2. How cancellation is detected inside the loop consuming the
//    `AsyncIterable` from `InferenceEngine.generate()`: that interface
//    doesn't by itself distinguish a cancellation from a normal completion
//    -- in both cases the iterable simply stops emitting chunks. That's why
//    this hook exposes `inferenceEngineForCancel`, a read-only wrapper
//    around the real `InferenceEngine` whose sole purpose is to mark,
//    through a mutable ref (`cancelledRef`), that the user requested
//    cancellation, before delegating to `inferenceEngine.cancel()`.
//    `MessageInput` must receive this wrapper (instead of the context's
//    `InferenceEngine` directly) for its Cancel button.
//
// 3. How `assistantMessage`/`retainedPartialText` are obtained for
//    persisting without depending on React's re-render: instead of reading
//    `generationState` from the context after dispatching the terminal
//    event (a `useReducer` dispatch is asynchronous and doesn't guarantee a
//    synchronously updated value), this hook keeps a local copy
//    (`localState`) updated by applying the same pure `reduceGeneration`
//    function on each received chunk. The terminal event is applied first
//    to that local copy (synchronously, in the same loop) to obtain the
//    result to persist, and only then dispatched to the context to update
//    the UI.
//
// 4. Dispatch-vs-persistence order: the terminal event is dispatched to
//    `dispatchGeneration` BEFORE persisting the resulting assistant
//    Message. This avoids the Chat_Interface simultaneously showing, during
//    the persistence `await`, both the ephemeral "generating"/"cancelled"
//    bubble and the already-persisted Message (see `MessageHistory.tsx`,
//    which no longer renders ephemeral content for the "cancelled" state
//    precisely because that persistence is now this hook's responsibility).

import { useCallback, useMemo, useRef } from "react";
import { useAppState } from "../app-state/useAppState";
import { useNotification } from "../notification/useNotification";
import { reduceGeneration } from "../inference-engine/reduceGeneration";
import type { GenerationState } from "../inference-engine/reduceGeneration";
import type { InferenceEngine } from "../inference-engine/InferenceEngine";
import type { Conversation, Message } from "../types/models";

const CREATE_CONVERSATION_ERROR_TEXT = "No se pudo crear la conversación. Intenta de nuevo.";
const SAVE_USER_MESSAGE_ERROR_TEXT = "No se pudo guardar tu mensaje. Intenta de nuevo.";
const SAVE_ASSISTANT_MESSAGE_ERROR_TEXT = "No se pudo guardar la respuesta del asistente.";
const GENERATION_ERROR_TEXT = "Ocurrió un error al generar la respuesta. Podés reintentar el envío.";
const NO_ACTIVE_CONVERSATION_ERROR_TEXT = "No se pudo reintentar el envío: no hay una conversación activa.";

function createUserMessage(content: string): Message {
  return {
    id: crypto.randomUUID(),
    role: "user",
    content,
    timestamp: Date.now(),
  };
}

function getHistory(conversations: Conversation[], conversationId: string): Message[] {
  return conversations.find((conversation) => conversation.id === conversationId)?.messages ?? [];
}

function errorDescription(error: unknown): string {
  return error instanceof Error ? error.message : "Error desconocido durante la generación.";
}

/**
 * Minimal indirection over `ref.current`, analogous to `isCancelled()` in
 * `AppStateProvider.tsx`: TypeScript, when narrowing types within the same
 * function where `cancelledRef.current = false` is assigned, can't see that
 * `inferenceEngineForCancel.cancel()` (invoked in a different closure,
 * inside the `for await`) may set it to `true` before this read, and treats
 * the read as always `false`. Isolating it in a separate module-level
 * function avoids that false positive without disabling the lint rule.
 */
function readCancelled(ref: { current: boolean }): boolean {
  return ref.current;
}

export interface UseSendMessageResult {
  /** Sends a new user Message with already validated/normalized content (4.6, 4.8, 4.9). */
  sendMessage: (normalizedContent: string) => Promise<void>;
  /** Retries sending after a generation error, reusing the already-persisted user Message (8.2). */
  retryMessage: (userMessage: Message) => Promise<void>;
  /**
   * `InferenceEngine` that `MessageInput` must use for its Cancel button
   * (see design decision 2 above): delegates to the context's real
   * instance but additionally marks the cancellation so this hook's loop
   * detects it.
   */
  inferenceEngineForCancel: InferenceEngine;
}

/**
 * Orchestration hook for the full Message-send flow (task 22.1). See the
 * file header for the design detail.
 */
export function useSendMessage(): UseSendMessageResult {
  const {
    generationState,
    dispatchGeneration,
    inferenceEngine,
    conversations,
    activeConversationId,
    createConversation,
    addMessage,
  } = useAppState();
  const { showNotification } = useNotification();

  const cancelledRef = useRef<boolean>(false);

  const inferenceEngineForCancel = useMemo<InferenceEngine>(
    () => ({
      initialize: (engine, modelId, contextWindowSize) =>
        inferenceEngine.initialize(engine, modelId, contextWindowSize),
      generate: (history) => inferenceEngine.generate(history),
      cancel: () => {
        cancelledRef.current = true;
        inferenceEngine.cancel();
      },
    }),
    [inferenceEngine],
  );

  const runGeneration = useCallback(
    async (conversationId: string, userMessage: Message, history: Message[]): Promise<void> => {
      cancelledRef.current = false;

      let localState: GenerationState = { type: "idle" };
      localState = reduceGeneration(localState, { type: "start", userMessage });
      dispatchGeneration({ type: "start", userMessage });

      try {
        for await (const chunk of inferenceEngine.generate(history)) {
          localState = reduceGeneration(localState, { type: "chunk", text: chunk });
          dispatchGeneration({ type: "chunk", text: chunk });
        }
      } catch (error) {
        dispatchGeneration({ type: "error", reason: errorDescription(error) });
        showNotification({ type: "error", text: GENERATION_ERROR_TEXT });
        return;
      }

      if (readCancelled(cancelledRef)) {
        const finalState = reduceGeneration(localState, { type: "cancel" });
        dispatchGeneration({ type: "cancel" });
        if (finalState.type === "cancelled") {
          const assistantMessage: Message = {
            id: crypto.randomUUID(),
            role: "assistant",
            content: finalState.retainedPartialText,
            timestamp: Date.now(),
          };
          try {
            await addMessage(conversationId, assistantMessage);
          } catch {
            showNotification({ type: "error", text: SAVE_ASSISTANT_MESSAGE_ERROR_TEXT });
          }
        }
        return;
      }

      const finalState = reduceGeneration(localState, { type: "complete" });
      dispatchGeneration({ type: "complete" });
      if (finalState.type === "completed") {
        try {
          await addMessage(conversationId, finalState.assistantMessage);
        } catch {
          showNotification({ type: "error", text: SAVE_ASSISTANT_MESSAGE_ERROR_TEXT });
        }
      }
    },
    [inferenceEngine, dispatchGeneration, addMessage, showNotification],
  );

  const sendMessage = useCallback(
    async (normalizedContent: string): Promise<void> => {
      // Defensive: MessageInput already disables sending while
      // generationState.type === "generating" (4.4); this guard prevents a
      // concurrent double invocation if it happened anyway.
      if (generationState.type === "generating") {
        return;
      }

      let conversationId = activeConversationId;
      if (conversationId === null) {
        try {
          const newConversation = await createConversation();
          conversationId = newConversation.id;
        } catch {
          showNotification({ type: "error", text: CREATE_CONVERSATION_ERROR_TEXT });
          return;
        }
      }

      const previousHistory = getHistory(conversations, conversationId);
      const userMessage = createUserMessage(normalizedContent);

      try {
        await addMessage(conversationId, userMessage);
      } catch {
        showNotification({ type: "error", text: SAVE_USER_MESSAGE_ERROR_TEXT });
        return;
      }

      await runGeneration(conversationId, userMessage, [...previousHistory, userMessage]);
    },
    [
      generationState,
      activeConversationId,
      conversations,
      createConversation,
      addMessage,
      showNotification,
      runGeneration,
    ],
  );

  const retryMessage = useCallback(
    async (userMessage: Message): Promise<void> => {
      if (generationState.type === "generating") {
        return;
      }

      if (activeConversationId === null) {
        // Shouldn't happen in practice: retrying implies the user Message
        // is already persisted in an existing Conversation. Reported
        // defensively in case it happens anyway.
        showNotification({ type: "error", text: NO_ACTIVE_CONVERSATION_ERROR_TEXT });
        return;
      }

      const history = getHistory(conversations, activeConversationId);
      await runGeneration(activeConversationId, userMessage, history);
    },
    [generationState, activeConversationId, conversations, runGeneration, showNotification],
  );

  return { sendMessage, retryMessage, inferenceEngineForCancel };
}
