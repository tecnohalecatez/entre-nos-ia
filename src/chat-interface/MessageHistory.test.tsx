// Unit tests for `MessageHistory` (task 17.2, part of task 17.4's full suite).
//
// A test `AppStateContextValue` is injected directly via
// `AppStateContext.Provider` (instead of mounting the full
// `AppStateProvider`, which requires Inference_Engine
// detection/initialization), since `MessageHistory` only reads
// `generationState`, `conversations` and `activeConversationId` from the
// context.
//
// See .kiro/specs/asistente-ia-local/design.md ("Interfaz_Chat") and
// requirements.md (4.2, 5.5).

import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AppStateContext, type AppStateContextValue } from "../app-state/context";
import { MessageHistory } from "./MessageHistory";
import type { Conversation, Message } from "../types/models";
import type { GenerationState } from "../inference-engine/reduceGeneration";

function createMessage(overrides: Partial<Message> & { id: string; timestamp: number }): Message {
  return {
    role: "user",
    content: `content-${overrides.id}`,
    ...overrides,
  };
}

function createTestContext(overrides: Partial<AppStateContextValue> = {}): AppStateContextValue {
  return {
    compatibility: null,
    loading: false,
    degradedMode: null,
    engineReady: true,
    generationState: { type: "idle" },
    dispatchGeneration: vi.fn(),
    inferenceEngine: { initialize: vi.fn(), generate: vi.fn(), cancel: vi.fn() },
    conversationManager: {} as AppStateContextValue["conversationManager"],
    conversations: [],
    reloadConversations: vi.fn().mockResolvedValue(undefined),
    activeConversationId: null,
    selectConversation: vi.fn(),
    createConversation: vi.fn(),
    deleteConversation: vi.fn(),
    importConversation: vi.fn(),
    addMessage: vi.fn(),
    ...overrides,
  };
}

function renderWithContext(contextValue: AppStateContextValue) {
  return render(
    <AppStateContext.Provider value={contextValue}>
      <MessageHistory />
    </AppStateContext.Provider>,
  );
}

describe("MessageHistory", () => {
  it("shows the empty state when there's no active conversation", () => {
    renderWithContext(createTestContext());

    expect(
      screen.getByText("Seleccioná o creá una conversación para comenzar."),
    ).toBeInTheDocument();
  });

  it("renders the active conversation's messages in ascending timestamp order (5.5)", () => {
    const conversation: Conversation = {
      id: "conv-1",
      createdAt: 1,
      messages: [
        createMessage({ id: "m3", timestamp: 300, role: "assistant", content: "tercero" }),
        createMessage({ id: "m1", timestamp: 100, role: "user", content: "primero" }),
        createMessage({ id: "m2", timestamp: 200, role: "user", content: "segundo" }),
      ],
    };

    renderWithContext(
      createTestContext({ conversations: [conversation], activeConversationId: "conv-1" }),
    );

    const texts = screen.getAllByText(/primero|segundo|tercero/).map((el) => el.textContent);
    expect(texts).toEqual(["primero", "segundo", "tercero"]);
  });

  it("renders no messages when the active conversation has none", () => {
    const conversation: Conversation = { id: "conv-1", createdAt: 1, messages: [] };

    renderWithContext(
      createTestContext({ conversations: [conversation], activeConversationId: "conv-1" }),
    );

    expect(screen.queryByRole("article")).not.toBeInTheDocument();
  });

  it("shows the partial text incrementally while a response is being generated (4.2)", () => {
    const conversation: Conversation = { id: "conv-1", createdAt: 1, messages: [] };
    const userMessage = createMessage({ id: "u1", timestamp: 10 });

    const generationState: GenerationState = {
      type: "generating",
      userMessage,
      partialText: "Hola",
    };

    renderWithContext(
      createTestContext({
        conversations: [conversation],
        activeConversationId: "conv-1",
        generationState,
      }),
    );

    expect(screen.getByText("Hola")).toBeInTheDocument();
  });

  it("updates the generating text reactively as partialText grows (4.2)", () => {
    const conversation: Conversation = { id: "conv-1", createdAt: 1, messages: [] };
    const userMessage = createMessage({ id: "u1", timestamp: 10 });

    const { rerender } = render(
      <AppStateContext.Provider
        value={createTestContext({
          conversations: [conversation],
          activeConversationId: "conv-1",
          generationState: { type: "generating", userMessage, partialText: "Ho" },
        })}
      >
        <MessageHistory />
      </AppStateContext.Provider>,
    );

    expect(screen.getByText("Ho")).toBeInTheDocument();

    rerender(
      <AppStateContext.Provider
        value={createTestContext({
          conversations: [conversation],
          activeConversationId: "conv-1",
          generationState: { type: "generating", userMessage, partialText: "Hola mundo" },
        })}
      >
        <MessageHistory />
      </AppStateContext.Provider>,
    );

    expect(screen.queryByText("Ho")).not.toBeInTheDocument();
    expect(screen.getByText("Hola mundo")).toBeInTheDocument();
  });

  it("does not show an extra ephemeral bubble when generation was cancelled (the Message is already persisted, task 22.1)", () => {
    const conversation: Conversation = {
      id: "conv-1",
      createdAt: 1,
      messages: [createMessage({ id: "assistant-1", timestamp: 20, role: "assistant", content: "texto cancelado" })],
    };
    const userMessage = createMessage({ id: "u1", timestamp: 10 });

    const generationState: GenerationState = {
      type: "cancelled",
      userMessage,
      retainedPartialText: "texto cancelado",
    };

    renderWithContext(
      createTestContext({
        conversations: [conversation],
        activeConversationId: "conv-1",
        generationState,
      }),
    );

    // The already-persisted Message is rendered exactly once (no duplicate
    // ephemeral bubble for the "cancelled" state).
    expect(screen.getAllByText("texto cancelado")).toHaveLength(1);
  });

  describe("auto-scroll", () => {
    // happy-dom (this project's test DOM environment) does no layout:
    // `scrollHeight`/`clientHeight` always read back 0 on real elements.
    // These tests shadow them with own data properties so the component's
    // `container.scrollTop = container.scrollHeight` assignment (and the
    // `isScrolledToBottom` check inside `onScroll`) becomes observable.
    function stubScrollMetrics(element: HTMLElement, scrollHeight: number, clientHeight: number): void {
      Object.defineProperty(element, "scrollHeight", { value: scrollHeight, configurable: true });
      Object.defineProperty(element, "clientHeight", { value: clientHeight, configurable: true });
    }

    it("follows new content by assigning scrollTop = scrollHeight while stuck to the bottom", () => {
      const conversation: Conversation = { id: "conv-1", createdAt: 1, messages: [] };
      const userMessage = createMessage({ id: "u1", timestamp: 10 });

      const { rerender } = render(
        <AppStateContext.Provider
          value={createTestContext({
            conversations: [conversation],
            activeConversationId: "conv-1",
            generationState: { type: "generating", userMessage, partialText: "Ho" },
          })}
        >
          <MessageHistory />
        </AppStateContext.Provider>,
      );

      const container = screen.getByRole("log", { name: "Historial de mensajes" });
      stubScrollMetrics(container, 500, 100);

      rerender(
        <AppStateContext.Provider
          value={createTestContext({
            conversations: [conversation],
            activeConversationId: "conv-1",
            generationState: { type: "generating", userMessage, partialText: "Hola mundo" },
          })}
        >
          <MessageHistory />
        </AppStateContext.Provider>,
      );

      expect(container.scrollTop).toBe(500);
    });

    it("does not move the scroll position once the user has scrolled away from the bottom", () => {
      const conversation: Conversation = { id: "conv-1", createdAt: 1, messages: [] };
      const userMessage = createMessage({ id: "u1", timestamp: 10 });

      const { rerender } = render(
        <AppStateContext.Provider
          value={createTestContext({
            conversations: [conversation],
            activeConversationId: "conv-1",
            generationState: { type: "generating", userMessage, partialText: "Ho" },
          })}
        >
          <MessageHistory />
        </AppStateContext.Provider>,
      );

      const container = screen.getByRole("log", { name: "Historial de mensajes" });
      stubScrollMetrics(container, 500, 100);

      // Simulates the user scrolling up, well past the bottom threshold.
      container.scrollTop = 50;
      fireEvent.scroll(container);

      rerender(
        <AppStateContext.Provider
          value={createTestContext({
            conversations: [conversation],
            activeConversationId: "conv-1",
            generationState: { type: "generating", userMessage, partialText: "Hola mundo" },
          })}
        >
          <MessageHistory />
        </AppStateContext.Provider>,
      );

      expect(container.scrollTop).toBe(50);
    });
  });
});
