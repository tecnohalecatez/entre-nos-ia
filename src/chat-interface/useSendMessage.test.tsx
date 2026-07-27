// Unit tests for `useSendMessage` (task 22.1).
//
// A test `AppStateContextValue` is injected directly via
// `AppStateContext.Provider` (same pattern as `MessageHistory.test.tsx`),
// with test doubles for `InferenceEngine` and for the context's
// persistence functions (`createConversation`, `addMessage`), avoiding a
// dependency on real WebGPU/WASM, real IndexedDB, or the WebLLM SDK.
//
// See .kiro/specs/asistente-ia-local/requirements.md (4.1, 4.2, 4.3, 4.5,
// 4.9, 5.1, 8.2).

import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { NotificationProvider } from "../notification";
import { AppStateContext, type AppStateContextValue } from "../app-state/context";
import { useSendMessage } from "./useSendMessage";
import type { InferenceEngine } from "../inference-engine/InferenceEngine";
import type { GenerationEvent } from "../inference-engine/reduceGeneration";
import type { Conversation, Message } from "../types/models";

/** Extracts the sequence of dispatched `event.type` values from a mocked `dispatchGeneration`, in order. */
function getDispatchedTypes(
  dispatchGeneration: ReturnType<typeof vi.fn<(event: GenerationEvent) => void>>,
): GenerationEvent["type"][] {
  return dispatchGeneration.mock.calls.map(([event]) => event.type);
}

function createFakeInferenceEngine(
  chunks: string[] = [],
  overrides: Partial<InferenceEngine> = {},
): { inferenceEngine: InferenceEngine; cancel: ReturnType<typeof vi.fn> } {
  const cancel = vi.fn();
  const inferenceEngine: InferenceEngine = {
    initialize: vi.fn().mockResolvedValue(undefined),
    generate: vi.fn().mockImplementation(
      () =>
        (async function* generateChunks(): AsyncIterable<string> {
          await Promise.resolve();
          for (const chunk of chunks) {
            yield chunk;
          }
        })(),
    ),
    cancel,
    ...overrides,
  };
  return { inferenceEngine, cancel };
}

function createTestContext(overrides: Partial<AppStateContextValue> = {}): AppStateContextValue {
  return {
    compatibility: null,
    loading: false,
    degradedMode: null,
    engineReady: true,
    modelLoadProgress: null,
    generationState: { type: "idle" },
    dispatchGeneration: vi.fn(),
    inferenceEngine: createFakeInferenceEngine().inferenceEngine,
    conversationManager: {} as AppStateContextValue["conversationManager"],
    conversations: [],
    reloadConversations: vi.fn().mockResolvedValue(undefined),
    activeConversationId: null,
    selectConversation: vi.fn(),
    createConversation: vi.fn(),
    deleteConversation: vi.fn(),
    importConversation: vi.fn(),
    addMessage: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function createWrapper(contextValue: AppStateContextValue) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <NotificationProvider>
        <AppStateContext.Provider value={contextValue}>{children}</AppStateContext.Provider>
      </NotificationProvider>
    );
  };
}

const EXISTING_CONVERSATION: Conversation = { id: "conv-1", createdAt: 1, messages: [] };

describe("useSendMessage - sendMessage", () => {
  it("creates a Conversation when none is active before persisting the Message (4.9)", async () => {
    const { inferenceEngine } = createFakeInferenceEngine(["Hola"]);
    const newConversation: Conversation = { id: "conv-nueva", createdAt: 2, messages: [] };
    const createConversation = vi.fn().mockResolvedValue(newConversation);
    const addMessage = vi.fn().mockResolvedValue(undefined);

    const context = createTestContext({
      inferenceEngine,
      activeConversationId: null,
      conversations: [],
      createConversation,
      addMessage,
    });

    const { result } = renderHook(() => useSendMessage(), { wrapper: createWrapper(context) });

    await act(async () => {
      await result.current.sendMessage("hola mundo");
    });

    expect(createConversation).toHaveBeenCalledTimes(1);
    expect(addMessage).toHaveBeenCalledWith(
      "conv-nueva",
      expect.objectContaining({ role: "user", content: "hola mundo" }),
    );
  });

  it("uses the existing active Conversation without creating a new one", async () => {
    const { inferenceEngine } = createFakeInferenceEngine(["Hola"]);
    const createConversation = vi.fn();
    const addMessage = vi.fn().mockResolvedValue(undefined);

    const context = createTestContext({
      inferenceEngine,
      activeConversationId: EXISTING_CONVERSATION.id,
      conversations: [EXISTING_CONVERSATION],
      createConversation,
      addMessage,
    });

    const { result } = renderHook(() => useSendMessage(), { wrapper: createWrapper(context) });

    await act(async () => {
      await result.current.sendMessage("segundo mensaje");
    });

    expect(createConversation).not.toHaveBeenCalled();
    expect(addMessage).toHaveBeenCalledWith(
      EXISTING_CONVERSATION.id,
      expect.objectContaining({ role: "user", content: "segundo mensaje" }),
    );
  });

  it("dispatches chunks incrementally and then 'complete', persisting the assistant Message (4.1, 4.2, 4.3, 5.1)", async () => {
    const { inferenceEngine } = createFakeInferenceEngine(["Hola", ", ", "mundo"]);
    const addMessage = vi.fn().mockResolvedValue(undefined);
    const dispatchGeneration = vi.fn();

    const context = createTestContext({
      inferenceEngine,
      activeConversationId: EXISTING_CONVERSATION.id,
      conversations: [EXISTING_CONVERSATION],
      addMessage,
      dispatchGeneration,
    });

    const { result } = renderHook(() => useSendMessage(), { wrapper: createWrapper(context) });

    await act(async () => {
      await result.current.sendMessage("hola");
    });

    const dispatchedTypes = getDispatchedTypes(dispatchGeneration);
    expect(dispatchedTypes).toEqual(["start", "chunk", "chunk", "chunk", "complete"]);

    // The persisted assistant Message must contain exactly the
    // concatenation of the generated chunks.
    expect(addMessage).toHaveBeenCalledWith(
      EXISTING_CONVERSATION.id,
      expect.objectContaining({ role: "assistant", content: "Hola, mundo" }),
    );
  });

  it("on an error during generation, dispatches 'error' and does NOT persist an assistant Message (8.2)", async () => {
    const inferenceEngine: InferenceEngine = {
      initialize: vi.fn().mockResolvedValue(undefined),
      generate: vi.fn().mockImplementation(
        () =>
          (async function* (): AsyncIterable<string> {
            await Promise.resolve();
            yield "Hola";
            throw new Error("fallo de generación simulado");
          })(),
      ),
      cancel: vi.fn(),
    };
    const addMessage = vi.fn().mockResolvedValue(undefined);
    const dispatchGeneration = vi.fn();

    const context = createTestContext({
      inferenceEngine,
      activeConversationId: EXISTING_CONVERSATION.id,
      conversations: [EXISTING_CONVERSATION],
      addMessage,
      dispatchGeneration,
    });

    const { result } = renderHook(() => useSendMessage(), { wrapper: createWrapper(context) });

    await act(async () => {
      await result.current.sendMessage("hola");
    });

    const dispatchedTypes = getDispatchedTypes(dispatchGeneration);
    expect(dispatchedTypes).toEqual(["start", "chunk", "error"]);

    // Only the user Message is persisted (one call), never an assistant one.
    expect(addMessage).toHaveBeenCalledTimes(1);
    expect(addMessage).toHaveBeenCalledWith(
      EXISTING_CONVERSATION.id,
      expect.objectContaining({ role: "user" }),
    );
  });

  it("cancelling through inferenceEngineForCancel dispatches 'cancel' and persists the retained partial text (4.5)", async () => {
    const addMessage = vi.fn().mockResolvedValue(undefined);
    const dispatchGeneration = vi.fn();
    const realCancel = vi.fn();

    const context = createTestContext({
      activeConversationId: EXISTING_CONVERSATION.id,
      conversations: [EXISTING_CONVERSATION],
      addMessage,
      dispatchGeneration,
    });

    const { result } = renderHook(() => useSendMessage(), { wrapper: createWrapper(context) });

    // The real inferenceEngine (injected in the context) simulates that,
    // after receiving a first chunk, the user cancels -- which, in the real
    // integration, WebLLM reflects by simply no longer emitting chunks on
    // the same AsyncIterable.
    context.inferenceEngine.generate = vi.fn().mockImplementation(
      () =>
        (async function* (): AsyncIterable<string> {
          await Promise.resolve();
          yield "Texto parc";
          result.current.inferenceEngineForCancel.cancel();
        })(),
    );
    context.inferenceEngine.cancel = realCancel;

    await act(async () => {
      await result.current.sendMessage("hola");
    });

    const dispatchedTypes = getDispatchedTypes(dispatchGeneration);
    expect(dispatchedTypes).toEqual(["start", "chunk", "cancel"]);
    expect(realCancel).toHaveBeenCalledTimes(1);

    // The retained partial text is persisted as the assistant Message.
    expect(addMessage).toHaveBeenCalledWith(
      EXISTING_CONVERSATION.id,
      expect.objectContaining({ role: "assistant", content: "Texto parc" }),
    );
  });
});

describe("useSendMessage - retryMessage", () => {
  const USER_MESSAGE_TO_RETRY: Message = {
    id: "user-message-1",
    role: "user",
    content: "mensaje que falló antes",
    timestamp: 500,
  };

  it("resends the same user Message without re-persisting it, and persists the new response on completion (8.2)", async () => {
    const generate = vi.fn().mockImplementation(
      () =>
        (async function* generateChunks(): AsyncIterable<string> {
          await Promise.resolve();
          for (const chunk of ["respuesta ", "reintentada"]) {
            yield chunk;
          }
        })(),
    );
    const inferenceEngine: InferenceEngine = {
      initialize: vi.fn().mockResolvedValue(undefined),
      generate,
      cancel: vi.fn(),
    };
    const addMessage = vi.fn().mockResolvedValue(undefined);
    const dispatchGeneration = vi.fn();
    const conversationWithFailedMessage: Conversation = {
      id: "conv-1",
      createdAt: 1,
      messages: [USER_MESSAGE_TO_RETRY],
    };

    const context = createTestContext({
      inferenceEngine,
      activeConversationId: conversationWithFailedMessage.id,
      conversations: [conversationWithFailedMessage],
      addMessage,
      dispatchGeneration,
      generationState: {
        type: "error",
        userMessage: USER_MESSAGE_TO_RETRY,
        error: "fallo anterior",
      },
    });

    const { result } = renderHook(() => useSendMessage(), { wrapper: createWrapper(context) });

    await act(async () => {
      await result.current.retryMessage(USER_MESSAGE_TO_RETRY);
    });

    // The user Message is not persisted again: only the assistant's response.
    expect(addMessage).toHaveBeenCalledTimes(1);
    expect(addMessage).toHaveBeenCalledWith(
      conversationWithFailedMessage.id,
      expect.objectContaining({ role: "assistant", content: "respuesta reintentada" }),
    );
    expect(generate).toHaveBeenCalledWith([USER_MESSAGE_TO_RETRY]);

    const dispatchedTypes = getDispatchedTypes(dispatchGeneration);
    expect(dispatchedTypes).toEqual(["start", "chunk", "chunk", "complete"]);
  });
});
