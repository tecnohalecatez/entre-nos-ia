// Additional unit test (task 19.5) closing a specific coverage gap of
// Requisito 9.1: `UpdateAvailableNotification.test.tsx` (task 19.2) verifies
// that the notification appears when a new version is detected and that it
// behaves correctly on an explicit user action (accept or dismiss), but does
// not verify the "until" nuance of the requirement: that the mere passing of
// time, with no user action, does NOT make the notification disappear on
// its own.
//
// Placed in a new file (instead of extending the sibling file from task
// 19.2) to avoid risking conflicts with that task.
//
// See .kiro/specs/asistente-ia-local/requirements.md (9.1):
// "...SHALL keep said notification visible until the user explicitly
// accepts or dismisses it."

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { NotificationProvider } from "../notification";
import { AppStateContext, type AppStateContextValue } from "../app-state/context";
import { UpdateAvailableNotification } from "./UpdateAvailableNotification";
import type { RegisterServiceWorkerCallbacks, SendSkipWaiting } from "./registerServiceWorker";

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

function createTestRegisterServiceWorker(): {
  registerServiceWorkerFn: (callbacks: RegisterServiceWorkerCallbacks) => SendSkipWaiting | undefined;
  triggerNeedRefresh: () => void;
} {
  let onNeedRefresh: (() => void) | undefined;

  const registerServiceWorkerFn = (
    callbacks: RegisterServiceWorkerCallbacks,
  ): SendSkipWaiting | undefined => {
    onNeedRefresh = callbacks.onNeedRefresh;
    return vi.fn();
  };

  return {
    registerServiceWorkerFn,
    triggerNeedRefresh: () => {
      act(() => {
        onNeedRefresh?.();
      });
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("UpdateAvailableNotification — persistence over time (9.1)", () => {
  it("stays visible after time passes with no user action", () => {
    const { registerServiceWorkerFn, triggerNeedRefresh } = createTestRegisterServiceWorker();
    const context = createTestContext();

    render(
      <NotificationProvider>
        <AppStateContext.Provider value={context}>
          <UpdateAvailableNotification registerServiceWorkerFn={registerServiceWorkerFn} />
        </AppStateContext.Provider>
      </NotificationProvider>,
    );

    triggerNeedRefresh();
    expect(screen.getByText("Hay una actualización disponible")).toBeInTheDocument();

    // Advances a simulated hour with no user acceptance or dismissal: there
    // is no auto-dismiss timer, so it must remain visible.
    act(() => {
      vi.advanceTimersByTime(60 * 60 * 1000);
    });

    expect(screen.getByText("Hay una actualización disponible")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Actualizar" })).toBeInTheDocument();
  });
});
