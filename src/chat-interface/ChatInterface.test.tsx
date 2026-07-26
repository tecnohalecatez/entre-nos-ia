// Tests for `ChatInterface` (task 20.1).
//
// The component is rendered inside `NotificationProvider` +
// `AppStateProvider`, injecting the same test doubles as
// `ConversationList.test.tsx`/`AppStateProvider.test.tsx`, to verify that
// the assembled layout correctly composes all the regions required by
// Requirement 10 (10.1, 10.2, 10.3): message input, active conversation's
// history and conversation list, plus the persistent indicators.
//
// The responsive behavior itself (width breakpoints, readjustment on
// orientation change) depends on real CSS layout that jsdom/happy-dom
// doesn't compute, so it isn't tested here -- that's covered by task 20.2
// (snapshot/visual-regression testing with simulated viewports). This suite
// is limited to checking structural composition: that all the pieces
// render together without errors and that the containers expose the CSS
// classes that `ChatInterface.css` hooks into.
//
// See .kiro/specs/asistente-ia-local/requirements.md (10.1, 10.2, 10.3).

import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { NotificationProvider } from "../notification";
import { AppStateProvider } from "../app-state/AppStateProvider";
import type { AppStateProviderProps } from "../app-state/AppStateProvider";
import { ConversationManager } from "../conversation-manager/ConversationManager";
import { ConversationStoreDexie } from "../conversation-store/ConversationStore";
import type { InferenceEngine } from "../inference-engine/InferenceEngine";
import type { DecideInput, CompatibilityResult } from "../compatibility-detector/decide";
import type { ModelDownloadManager } from "../model-download-manager/ensureModelAvailable";
import { ThemeProvider } from "../theme";
import { ChatInterface } from "./ChatInterface";

beforeEach(() => {
  // fake-indexeddb doesn't isolate automatically between tests (same
  // pattern as the rest of the Chat_Interface suites).
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
    <ThemeProvider>
      <NotificationProvider>
        <AppStateProvider
          detectFn={vi.fn().mockResolvedValue(ANY_PROBE)}
          decideFn={vi.fn().mockReturnValue(RESULT_WITH_ENGINE)}
          createInferenceEngine={createFakeInferenceEngine}
          createConversationManager={createTestConversationManager}
          modelDownloadManager={createTestModelDownloadManager()}
          {...props}
        >
          <ChatInterface />
        </AppStateProvider>
      </NotificationProvider>
    </ThemeProvider>,
  );
}

/** Waits for `AppStateProvider`'s boot sequence to finish. */
async function waitForBoot(): Promise<void> {
  await waitFor(() => {
    expect(screen.queryByText(/preparando el asistente/i)).not.toBeInTheDocument();
  });
}

describe("ChatInterface", () => {
  it("assembles the three regions required by Requirement 10 without failing (10.1, 10.2)", async () => {
    const { container } = renderWithProviders();
    await waitForBoot();

    // Message input.
    expect(screen.getByRole("textbox", { name: "Mensaje" })).toBeInTheDocument();
    // Active conversation's history (with no active conversation, it
    // renders as "region" instead of "log"; see MessageHistory.tsx).
    expect(screen.getByRole("region", { name: "Historial de mensajes" })).toBeInTheDocument();
    // Conversation list.
    expect(screen.getByRole("navigation", { name: "Conversaciones" })).toBeInTheDocument();

    // CSS structure that the responsive layout hooks into (ChatInterface.css).
    expect(container.querySelector(".chat-interface")).not.toBeNull();
    expect(container.querySelector(".chat-interface__body")).not.toBeNull();
    expect(container.querySelector(".chat-interface__conversation-list")).not.toBeNull();
    expect(container.querySelector(".chat-interface__main")).not.toBeNull();
  });

  it("shows the active-engine indicator (1.6)", async () => {
    renderWithProviders();
    await waitForBoot();

    expect(screen.getByText("WebGPU")).toBeInTheDocument();
  });

  it("the help section is hidden by default and shows when the Help button is activated (10.4)", async () => {
    renderWithProviders();
    await waitForBoot();

    expect(screen.queryByRole("region", { name: "Información y ayuda" })).not.toBeInTheDocument();

    const button = screen.getByRole("button", { name: "Ayuda" });
    button.click();

    await waitFor(() => {
      expect(screen.getByRole("region", { name: "Información y ayuda" })).toBeInTheDocument();
    });
  });
});
