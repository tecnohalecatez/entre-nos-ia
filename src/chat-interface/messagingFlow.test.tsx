// Light integration tests for the conversation/messaging flow (task 17.4),
// covering the genuine gaps not exercised by the `MessageInput` (17.3),
// `MessageHistory` (17.2) and `ConversationList` (17.1) unit suites:
//
// - 4.9 (sending with no active conversation): `MessageInput` does NOT
//   orchestrate creating a Conversation when none is active -- that full
//   orchestration is task 22.1's responsibility (see the design note in
//   `MessageInput.tsx`) and is tested end-to-end in task 22.3. What DOES
//   exist and can be tested today is the primitive that future flow will
//   use: `AppStateProvider.createConversation()` must create a Conversation
//   and mark it active when `activeConversationId` is `null`. This test
//   verifies that primitive at the `AppStateProvider`/`ConversationManager`
//   level.
// - 4.5 (cancellation retaining partial text): `reduceGeneration`'s pure
//   transition is already exhaustively tested in
//   `reduceGeneration.test.ts`/`.property.test.ts`, and rendering the
//   `"cancelled"` state is already tested in `MessageHistory.test.tsx`.
//   What isn't tested is that, sharing the same reactive `generationState`
//   (as will happen once wired by task 22.1), clicking `MessageInput`'s
//   "Cancelar" (which calls `inferenceEngine.cancel()`) combined with
//   dispatching `{ type: "cancel" }` on that shared state effectively makes
//   `MessageHistory` show the retained partial text. A minimal test harness
//   with `useReducer(reduceGeneration, ...)` is used to simulate that
//   shared state without depending on task 22.1's full integration (which
//   doesn't exist yet).
//
// See .kiro/specs/asistente-ia-local/requirements.md (4.5, 4.9).

import "fake-indexeddb/auto";
import { useReducer, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NotificationProvider } from "../notification";
import { AppStateProvider } from "../app-state/AppStateProvider";
import type { AppStateProviderProps } from "../app-state/AppStateProvider";
import { useAppState } from "../app-state/useAppState";
import { ConversationManager } from "../conversation-manager/ConversationManager";
import { ConversationStoreDexie } from "../conversation-store/ConversationStore";
import { reduceGeneration } from "../inference-engine/reduceGeneration";
import type { GenerationState } from "../inference-engine/reduceGeneration";
import type { InferenceEngine } from "../inference-engine/InferenceEngine";
import type { DecideInput, CompatibilityResult } from "../compatibility-detector/decide";
import type { Conversation, Message } from "../types/models";
import type { ModelDownloadManager } from "../model-download-manager/ensureModelAvailable";
import { MessageInput } from "./MessageInput";
import { MessageHistory } from "./MessageHistory";
import { AppStateContext } from "../app-state/context";
import type { AppStateContextValue } from "../app-state/context";

beforeEach(() => {
  // fake-indexeddb doesn't isolate automatically between tests (same
  // pattern as the rest of this task's suites).
  indexedDB.deleteDatabase("ConversationStore");
});

function createTestConversationManager(): ConversationManager {
  return new ConversationManager(new ConversationStoreDexie());
}

function createFakeInferenceEngine(): InferenceEngine {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    generate: vi.fn(),
    cancel: vi.fn(),
  };
}

/** Variant that also exposes `cancel` as a direct reference, avoiding
 * accessing `inferenceEngine.cancel` (unbound method) in assertions, same
 * as `MessageInput.test.tsx` does. */
function createFakeInferenceEngineWithExposedCancel(): {
  inferenceEngine: InferenceEngine;
  cancel: ReturnType<typeof vi.fn>;
} {
  const cancel = vi.fn();
  const inferenceEngine: InferenceEngine = {
    initialize: vi.fn().mockResolvedValue(undefined),
    generate: vi.fn(),
    cancel,
  };
  return { inferenceEngine, cancel };
}

const ANY_PROBE: DecideInput = {
  webgpuAvailable: true,
  wasmAvailable: true,
  memoryGB: 8,
  isMobileDevice: false,
  shaderF16Available: true,
};

const RESULT_WITH_ENGINE: CompatibilityResult = {
  webgpuAvailable: true,
  wasmAvailable: false,
  memoryGB: 8,
  selectedEngine: "webgpu",
  missingCapabilities: [],
  modelTier: "full",
  shaderF16Available: true,
};

/** Minimal probe exposing the context's `createConversation`/`activeConversationId`. */
function ActiveConversationProbe() {
  const { activeConversationId, createConversation } = useAppState();
  return (
    <div>
      <p data-testid="active-conversation-id">{activeConversationId ?? "null"}</p>
      <button type="button" onClick={() => void createConversation()}>
        Crear conversación (simula envío sin conversación activa)
      </button>
    </div>
  );
}

/**
 * Test `ModelDownloadManager`: resolves immediately with no real I/O.
 * Needed since task 22.2, as `AppStateProvider`'s production default is no
 * longer `undefined` (it would attempt a real `fetch`).
 */
function createTestModelDownloadManager(): ModelDownloadManager {
  return { ensureModelAvailable: vi.fn().mockResolvedValue(undefined) };
}

function renderWithProviders(props: Partial<AppStateProviderProps> = {}) {
  return render(
    <NotificationProvider>
      <AppStateProvider
        detectFn={vi.fn().mockResolvedValue(ANY_PROBE)}
        decideFn={vi.fn().mockReturnValue(RESULT_WITH_ENGINE)}
        createInferenceEngine={createFakeInferenceEngine}
        createConversationManager={createTestConversationManager}
        modelDownloadManager={createTestModelDownloadManager()}
        {...props}
      >
        <ActiveConversationProbe />
      </AppStateProvider>
    </NotificationProvider>,
  );
}

async function waitForBoot(): Promise<void> {
  await waitFor(() => {
    expect(screen.getByTestId("active-conversation-id")).toBeInTheDocument();
  });
}

describe("Messaging flow - sending with no active conversation (4.9)", () => {
  it(
    "createConversation() creates a Conversation and marks it active when " +
      "activeConversationId is null (primitive used by the future send flow; " +
      "4.9's full orchestration is tested end-to-end in task 22.3)",
    async () => {
      renderWithProviders();
      await waitForBoot();

      expect(screen.getByTestId("active-conversation-id").textContent).toBe("null");

      const user = userEvent.setup();
      await user.click(
        screen.getByRole("button", { name: "Crear conversación (simula envío sin conversación activa)" }),
      );

      await waitFor(() => {
        expect(screen.getByTestId("active-conversation-id").textContent).not.toBe("null");
      });
    },
  );
});

const USER_MESSAGE: Message = {
  id: "user-message-1",
  role: "user",
  content: "hola, ¿cómo estás?",
  timestamp: 1000,
};

/**
 * Minimal test harness connecting `MessageInput` and `MessageHistory` to
 * the same reactive `generationState` via `useReducer(reduceGeneration, ...)`.
 * Simulates, via a test button, what the `AsyncIterable`-consuming loop
 * from `InferenceEngine.generate()` does in `useSendMessage.ts` (task 22.1)
 * on detecting a cancellation: dispatches `{ type: "cancel" }` and persists
 * the retained partial text as a real conversation Message (Requirement
 * 4.5) -- see the design note in `MessageHistory.tsx` about why that
 * component no longer renders an extra ephemeral bubble for the
 * "cancelled" state.
 */
function CancellationHarness({ inferenceEngine }: { inferenceEngine: InferenceEngine }) {
  const [generationState, dispatchGeneration] = useReducer(reduceGeneration, {
    type: "generating",
    userMessage: USER_MESSAGE,
    partialText: "Hola, estoy proces",
  } as GenerationState);
  const [conversations, setConversations] = useState<Conversation[]>([
    { id: "conv-1", createdAt: 1, messages: [] },
  ]);

  const contextValue: AppStateContextValue = {
    compatibility: null,
    loading: false,
    degradedMode: null,
    engineReady: true,
    generationState,
    dispatchGeneration,
    inferenceEngine,
    conversationManager: {} as AppStateContextValue["conversationManager"],
    conversations,
    reloadConversations: vi.fn().mockResolvedValue(undefined),
    activeConversationId: "conv-1",
    selectConversation: vi.fn(),
    createConversation: vi.fn(),
    deleteConversation: vi.fn(),
    importConversation: vi.fn(),
    addMessage: vi.fn(),
  };

  return (
    <AppStateContext.Provider value={contextValue}>
      <MessageInput
        generationState={generationState}
        engineReady={true}
        inferenceEngine={inferenceEngine}
        onSend={vi.fn()}
        onRetry={vi.fn()}
      />
      <MessageHistory />
      {/*
       * Minimally simulates what the `AsyncIterable`-consuming loop from
       * `InferenceEngine.generate()` does in `useSendMessage.ts`: on
       * detecting the generation was cancelled, dispatches { type: "cancel" }
       * on the same state that was already accumulating chunks, and
       * persists the retained partial text as a real conversation Message.
       * Triggered via a test button instead of automatically to keep
       * explicit test control over event ordering.
       */}
      <button
        type="button"
        data-testid="simulate-cancellation-detection-by-generation-loop"
        onClick={() => {
          const resultingState = reduceGeneration(generationState, { type: "cancel" });
          dispatchGeneration({ type: "cancel" });
          if (resultingState.type === "cancelled") {
            setConversations((current) =>
              current.map((conversation) =>
                conversation.id === "conv-1"
                  ? {
                      ...conversation,
                      messages: [
                        ...conversation.messages,
                        {
                          id: "cancelled-assistant-message",
                          role: "assistant",
                          content: resultingState.retainedPartialText,
                          timestamp: Date.now(),
                        },
                      ],
                    }
                  : conversation,
              ),
            );
          }
        }}
      >
        Simular detección de cancelación por el bucle de generación
      </button>
    </AppStateContext.Provider>
  );
}

describe("Messaging flow - cancellation retains partial text (4.5)", () => {
  it(
    "clicking Cancelar (which invokes inferenceEngine.cancel()) and dispatching " +
      "{ type: 'cancel' } on the shared generationState persists and shows the partial " +
      "text exactly as the assistant Message",
    async () => {
      const { inferenceEngine, cancel } = createFakeInferenceEngineWithExposedCancel();
      const user = userEvent.setup();

      render(<CancellationHarness inferenceEngine={inferenceEngine} />);

      // The already-accumulated partial text is visible while generating.
      expect(screen.getByText("Hola, estoy proces")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Cancelar" }));
      expect(cancel).toHaveBeenCalledOnce();

      // The AsyncIterable-consuming loop is the one that dispatches the
      // real transition once it detects the cancellation, and persists the
      // retained partial text as a real Message.
      await user.click(
        screen.getByTestId("simulate-cancellation-detection-by-generation-loop"),
      );

      // The partial text is preserved exactly (now as a persisted Message,
      // not an ephemeral bubble), and the Cancel button is no longer shown
      // (the state is no longer "generating").
      expect(screen.getByText("Hola, estoy proces")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Cancelar" })).not.toBeInTheDocument();
    },
  );
});
