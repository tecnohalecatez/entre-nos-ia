// Unit tests for `ActiveEngineIndicator` (task 19.1).
//
// A test `AppStateContextValue` is injected directly via
// `AppStateContext.Provider` (same pattern as `MessageHistory.test.tsx`),
// since `ActiveEngineIndicator` only reads `compatibility` from the context.
//
// See .kiro/specs/asistente-ia-local/design.md ("Interfaz_Chat") and
// requirements.md (1.6).

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppStateContext, type AppStateContextValue } from "../app-state/context";
import { ActiveEngineIndicator } from "./ActiveEngineIndicator";
import type { CompatibilityResult } from "../compatibility-detector/decide";

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

function createCompatibility(
  overrides: Partial<CompatibilityResult> = {},
): CompatibilityResult {
  return {
    webgpuAvailable: false,
    wasmAvailable: false,
    memoryGB: 8,
    selectedEngine: "none",
    missingCapabilities: [],
    modelTier: "full",
    shaderF16Available: true,
    ...overrides,
  };
}

function renderWithContext(contextValue: AppStateContextValue) {
  return render(
    <AppStateContext.Provider value={contextValue}>
      <ActiveEngineIndicator />
    </AppStateContext.Provider>,
  );
}

describe("ActiveEngineIndicator", () => {
  it("shows 'WebGPU' when the selected engine is webgpu (1.6)", () => {
    renderWithContext(
      createTestContext({
        compatibility: createCompatibility({ selectedEngine: "webgpu" }),
      }),
    );

    expect(screen.getByText("WebGPU")).toBeInTheDocument();
  });

  it("shows 'WebAssembly' when the selected engine is wasm (1.6)", () => {
    renderWithContext(
      createTestContext({
        compatibility: createCompatibility({ selectedEngine: "wasm" }),
      }),
    );

    expect(screen.getByText("WebAssembly")).toBeInTheDocument();
  });

  it("renders nothing when compatibility is null (boot in progress)", () => {
    const { container } = renderWithContext(createTestContext({ compatibility: null }));

    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the selected engine is 'none' (Degraded_Mode)", () => {
    const { container } = renderWithContext(
      createTestContext({
        compatibility: createCompatibility({ selectedEngine: "none" }),
      }),
    );

    expect(container).toBeEmptyDOMElement();
  });
});
