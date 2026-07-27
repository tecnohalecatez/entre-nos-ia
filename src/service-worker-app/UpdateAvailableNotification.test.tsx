// Unit tests for `UpdateAvailableNotification` (task 19.2).
//
// Test doubles are injected for `registerServiceWorkerFn`/
// `createUpdateControllerFn` (instead of mocking the `virtual:pwa-register`
// virtual module, already covered exhaustively in
// `serviceWorkerLifecycle.integration.test.ts`) to trigger `onNeedRefresh`
// deterministically and verify the wiring between the notification and the
// update controller.
//
// `AppStateContextValue` is injected directly via `AppStateContext.Provider`
// (same pattern as `ActiveEngineIndicator.test.tsx`/`MessageHistory.test.tsx`).
//
// See .kiro/specs/asistente-ia-local/requirements.md (9.1, 9.2, 9.6).

import { describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NotificationProvider } from "../notification";
import { AppStateContext, type AppStateContextValue } from "../app-state/context";
import { UpdateAvailableNotification } from "./UpdateAvailableNotification";
import type { RegisterServiceWorkerCallbacks, SendSkipWaiting } from "./registerServiceWorker";
import type { GenerationState } from "../inference-engine/reduceGeneration";

function createTestContext(overrides: Partial<AppStateContextValue> = {}): AppStateContextValue {
  return {
    compatibility: null,
    loading: false,
    degradedMode: null,
    engineReady: true,
    modelLoadProgress: null,
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

/** Test double for `registerServiceWorker`: saves the received callback so
 * the test can trigger `onNeedRefresh()` manually, and returns a spy-able
 * `sendSkipWaiting`. */
function createTestRegisterServiceWorker(): {
  registerServiceWorkerFn: (callbacks: RegisterServiceWorkerCallbacks) => SendSkipWaiting | undefined;
  triggerNeedRefresh: () => void;
  sendSkipWaiting: ReturnType<typeof vi.fn>;
} {
  const sendSkipWaiting = vi.fn();
  let onNeedRefresh: (() => void) | undefined;

  const registerServiceWorkerFn = (
    callbacks: RegisterServiceWorkerCallbacks,
  ): SendSkipWaiting | undefined => {
    onNeedRefresh = callbacks.onNeedRefresh;
    return sendSkipWaiting;
  };

  return {
    registerServiceWorkerFn,
    triggerNeedRefresh: () => {
      act(() => {
        onNeedRefresh?.();
      });
    },
    sendSkipWaiting,
  };
}

function renderComponent(appStateOverrides: Partial<AppStateContextValue> = {}) {
  const registration = createTestRegisterServiceWorker();
  const context = createTestContext(appStateOverrides);

  const renderUtils = render(
    <NotificationProvider>
      <AppStateContext.Provider value={context}>
        <UpdateAvailableNotification registerServiceWorkerFn={registration.registerServiceWorkerFn} />
      </AppStateContext.Provider>
    </NotificationProvider>,
  );

  return { ...renderUtils, ...registration };
}

const generatingState: GenerationState = {
  type: "generating",
  userMessage: { id: "msg-1", role: "user", content: "hola", timestamp: 0 },
  partialText: "...",
};

describe("UpdateAvailableNotification", () => {
  it("renders no notification while no new version has been detected", () => {
    renderComponent();

    expect(screen.queryByText("Hay una actualización disponible")).not.toBeInTheDocument();
  });

  it("shows a notification with the 'Actualizar' action when a new version is detected (9.1)", () => {
    const { triggerNeedRefresh } = renderComponent();

    triggerNeedRefresh();

    expect(screen.getByText("Hay una actualización disponible")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Actualizar" })).toBeInTheDocument();
  });

  it("clicking 'Actualizar' with no generation in progress applies the update immediately (9.2)", async () => {
    const { triggerNeedRefresh, sendSkipWaiting } = renderComponent({
      generationState: { type: "idle" },
    });
    triggerNeedRefresh();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Actualizar" }));

    expect(sendSkipWaiting).toHaveBeenCalledTimes(1);
  });

  it("clicking 'Actualizar' with a generation in progress defers the update and applies it automatically once it finishes (9.2, 9.4, 9.5)", async () => {
    const registration = createTestRegisterServiceWorker();

    function Wrapper({ state }: { state: GenerationState }) {
      return (
        <NotificationProvider>
          <AppStateContext.Provider value={createTestContext({ generationState: state })}>
            <UpdateAvailableNotification registerServiceWorkerFn={registration.registerServiceWorkerFn} />
          </AppStateContext.Provider>
        </NotificationProvider>
      );
    }

    const { rerender } = render(<Wrapper state={generatingState} />);
    registration.triggerNeedRefresh();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Actualizar" }));

    // Deferred: SKIP_WAITING is not sent while a response is being generated.
    expect(registration.sendSkipWaiting).not.toHaveBeenCalled();

    // Generation finishes: the same component instance stays mounted
    // (`rerender` preserves the tree identity), so its internal
    // `controllerRef` receives the new `GenerationState` and automatically
    // applies the previously deferred update.
    rerender(<Wrapper state={{ type: "idle" }} />);

    await waitFor(() => {
      expect(registration.sendSkipWaiting).toHaveBeenCalledTimes(1);
    });
  });

  it("dismissing the notification (x button) does not apply the update, and the generation in progress is not interrupted (9.6)", async () => {
    const { triggerNeedRefresh, sendSkipWaiting } = renderComponent({
      generationState: generatingState,
    });
    triggerNeedRefresh();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Descartar notificación" }));

    await waitFor(() => {
      expect(screen.queryByText("Hay una actualización disponible")).not.toBeInTheDocument();
    });
    expect(sendSkipWaiting).not.toHaveBeenCalled();
  });
});
