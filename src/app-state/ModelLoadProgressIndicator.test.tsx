// Unit tests for `ModelLoadProgressIndicator` (Requisito 2.2).
//
// A test `AppStateContextValue` is injected directly via
// `AppStateContext.Provider` (same pattern as
// `chat-interface/ActiveEngineIndicator.test.tsx`), since the component only
// reads `modelLoadProgress`/`compatibility` from the context.

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppStateContext, type AppStateContextValue } from "./context";
import { ModelLoadProgressIndicator } from "./ModelLoadProgressIndicator";
import type { CompatibilityResult } from "../compatibility-detector/decide";
import type { ModelLoadProgress } from "./modelLoadProgress";

function createTestContext(overrides: Partial<AppStateContextValue> = {}): AppStateContextValue {
  return {
    compatibility: null,
    loading: true,
    degradedMode: null,
    engineReady: false,
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

function createCompatibility(overrides: Partial<CompatibilityResult> = {}): CompatibilityResult {
  return {
    webgpuAvailable: true,
    wasmAvailable: false,
    memoryGB: 8,
    selectedEngine: "webgpu",
    missingCapabilities: [],
    modelTier: "compact",
    shaderF16Available: true,
    ...overrides,
  };
}

function renderWithContext(contextValue: AppStateContextValue) {
  return render(
    <AppStateContext.Provider value={contextValue}>
      <ModelLoadProgressIndicator />
    </AppStateContext.Provider>,
  );
}

describe("ModelLoadProgressIndicator", () => {
  it("renders an indeterminate progressbar before the first report arrives", () => {
    renderWithContext(createTestContext());

    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAccessibleName("Preparando el asistente…");
    expect(bar).not.toHaveAttribute("aria-valuenow");
  });

  it("renders phase, percentage, transfer detail and the selected model once a report arrives", () => {
    const modelLoadProgress: ModelLoadProgress = {
      phase: "downloading",
      percentage: 62,
      step: { current: 6, total: 23 },
      megabytes: 512,
      secondsElapsed: 14,
    };

    renderWithContext(
      createTestContext({
        modelLoadProgress,
        compatibility: createCompatibility({ modelTier: "compact", shaderF16Available: true }),
      }),
    );

    expect(screen.getByText("Descargando el modelo (fragmento 6/23)")).toBeInTheDocument();
    expect(screen.getByText("512 MB · 14 s")).toBeInTheDocument();
    expect(screen.getByText(/Llama 3\.2 1B/)).toBeInTheDocument();
    expect(screen.getByText(/versión compacta \(móvil\)/)).toBeInTheDocument();

    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "62");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
  });

  it("shows the desktop/full-size model label when modelTier is 'full'", () => {
    renderWithContext(
      createTestContext({
        modelLoadProgress: { phase: "ready", percentage: 100, step: null, megabytes: null, secondsElapsed: 22 },
        compatibility: createCompatibility({ modelTier: "full", shaderF16Available: true }),
      }),
    );

    expect(screen.getByText(/Llama 3\.2 3B/)).toBeInTheDocument();
    expect(screen.getByText(/versión completa \(escritorio\)/)).toBeInTheDocument();
  });

  it("omits the detail line when there is no step or megabytes to show", () => {
    renderWithContext(
      createTestContext({
        modelLoadProgress: { phase: "starting", percentage: 0, step: null, megabytes: null, secondsElapsed: 0 },
      }),
    );

    expect(screen.queryByText(/·/)).not.toBeInTheDocument();
  });
});
