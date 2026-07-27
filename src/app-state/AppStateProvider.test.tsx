// Tests for `AppStateProvider`'s orchestration wiring (tasks 16.1, 22.2).
//
// Test doubles are injected for `detectFn`, `decideFn`,
// `createInferenceEngine` and `modelDownloadManager`, avoiding a dependency
// on real WebGPU/WASM, real IndexedDB, or the WebLLM SDK.
// `createConversationManager` is injected with a `ConversationManager` built
// over `fake-indexeddb` so these tests aren't coupled to the real
// availability of an IndexedDB engine in the test environment.
//
// See .kiro/specs/asistente-ia-local/design.md ("Boot sequence") and
// requirements.md (1.3, 1.8, 2.1, 2.5, 3.5, 8.1, 8.4, 8.5, 10.6).

import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { NotificationProvider } from "../notification";
import { AppStateProvider } from "./AppStateProvider";
import { useAppState } from "./useAppState";
import { degradedModeMessage } from "./degradedMode";
import { ConversationManager } from "../conversation-manager/ConversationManager";
import { ConversationStoreDexie } from "../conversation-store/ConversationStore";
import { EngineInitializationError } from "../inference-engine/InferenceEngine";
import type { InferenceEngine } from "../inference-engine/InferenceEngine";
import type { DecideInput, CompatibilityResult } from "../compatibility-detector/decide";
import { decide } from "../compatibility-detector/decide";
import { MODEL_ID_FULL, MODEL_ID_FULL_F32, MODEL_ID_COMPACT, MODEL_ID_COMPACT_F32 } from "./configuration";
import { ModelDownloadError } from "../model-download-manager/ensureModelAvailable";
import type { ModelDownloadManager } from "../model-download-manager/ensureModelAvailable";
import type { AppStateProviderProps } from "./AppStateProvider";
import { markGenerationStarted } from "./sessionDiagnostics";

beforeEach(() => {
  // fake-indexeddb doesn't isolate automatically between tests (same
  // pattern as ConversationStore.test.ts): the whole database is wiped
  // before each test so `reloadConversations()` doesn't see data from a
  // previous test.
  indexedDB.deleteDatabase("ConversationStore");
});

function createTestConversationManager(): ConversationManager {
  return new ConversationManager(new ConversationStoreDexie());
}

function createFakeInferenceEngine(overrides: Partial<InferenceEngine> = {}): {
  inferenceEngine: InferenceEngine;
  initialize: ReturnType<typeof vi.fn>;
} {
  const initialize = vi.fn().mockResolvedValue(undefined);
  const inferenceEngine: InferenceEngine = {
    initialize,
    generate: vi.fn(),
    cancel: vi.fn(),
    ...overrides,
  };
  return { inferenceEngine, initialize };
}

/** Arbitrary input probe, irrelevant once `decideFn` is injected directly. */
const ANY_PROBE: DecideInput = {
  webgpuAvailable: true,
  wasmAvailable: true,
  memoryGB: 8,
  isMobileDevice: false,
  shaderF16Available: true,
};

/** Test helper component: exposes the context state as rendered text. */
function AppStateProbe() {
  const { loading, degradedMode, engineReady, compatibility } = useAppState();
  const detail = degradedMode?.type === "engine_init_failure" ? degradedMode.detail : undefined;
  return (
    <div>
      <p data-testid="loading">{String(loading)}</p>
      <p data-testid="engine-ready">{String(engineReady)}</p>
      <p data-testid="degraded-mode">{degradedMode === null ? "null" : degradedModeMessage(degradedMode)}</p>
      <p data-testid="degraded-mode-detail">{detail ?? "null"}</p>
      <p data-testid="selected-engine">{compatibility?.selectedEngine ?? "null"}</p>
    </div>
  );
}

/**
 * Default test `ModelDownloadManager`: resolves immediately with no real
 * I/O. Tests that explicitly exercise the model-ensuring step (success or
 * failure) override it via `props.modelDownloadManager`. Needed because the
 * production default (task 22.2) is no longer `undefined`: without this
 * double, these tests would attempt a real `fetch` against the configured
 * origin.
 */
function createTestModelDownloadManager(): ModelDownloadManager {
  return { ensureModelAvailable: vi.fn().mockResolvedValue(undefined) };
}

function renderWithProviders(props: Partial<AppStateProviderProps> = {}) {
  return render(
    <NotificationProvider>
      <AppStateProvider
        detectFn={vi.fn().mockResolvedValue(ANY_PROBE)}
        decideFn={decide}
        createConversationManager={createTestConversationManager}
        modelDownloadManager={createTestModelDownloadManager()}
        {...props}
      >
        <AppStateProbe />
      </AppStateProvider>
    </NotificationProvider>,
  );
}

describe("AppStateProvider - Degraded_Mode activation", () => {
  it("activates Degraded_Mode when decide() determines neither WebGPU nor WASM are available (1.3, 10.6)", async () => {
    const decideFn = vi.fn(
      (): CompatibilityResult => ({
        webgpuAvailable: false,
        wasmAvailable: false,
        memoryGB: 8,
        selectedEngine: "none",
        missingCapabilities: ["webgpu", "wasm"],
        modelTier: "full",
        shaderF16Available: true,
      }),
    );

    renderWithProviders({ decideFn });

    await waitFor(() => {
      expect(screen.getByTestId("degraded-mode").textContent).not.toBe("null");
    });
    expect(screen.getByTestId("degraded-mode").textContent).toContain("WebGPU, WebAssembly");
    expect(screen.getByTestId("loading").textContent).toBe("false");
  });

  it("activates Degraded_Mode when decide() determines insufficient memory (1.8)", async () => {
    const decideFn = vi.fn(
      (): CompatibilityResult => ({
        webgpuAvailable: true,
        wasmAvailable: true,
        memoryGB: 2,
        selectedEngine: "none",
        missingCapabilities: ["memory"],
        modelTier: "full",
        shaderF16Available: true,
      }),
    );

    renderWithProviders({ decideFn });

    await waitFor(() => {
      expect(screen.getByTestId("degraded-mode").textContent).not.toBe("null");
    });
    expect(screen.getByTestId("degraded-mode").textContent).toContain("memoria suficiente");
  });

  it("does NOT activate Degraded_Mode and marks engineReady when compatible and initialization succeeds", async () => {
    const decideFn = vi.fn(
      (): CompatibilityResult => ({
        webgpuAvailable: true,
        wasmAvailable: false,
        memoryGB: 8,
        selectedEngine: "webgpu",
        missingCapabilities: [],
        modelTier: "full",
        shaderF16Available: true,
      }),
    );
    const { inferenceEngine, initialize } = createFakeInferenceEngine();

    renderWithProviders({ decideFn, createInferenceEngine: () => inferenceEngine });

    await waitFor(() => {
      expect(screen.getByTestId("engine-ready").textContent).toBe("true");
    });
    expect(screen.getByTestId("degraded-mode").textContent).toBe("null");
    expect(screen.getByTestId("loading").textContent).toBe("false");
    expect(initialize).toHaveBeenCalledWith("webgpu", MODEL_ID_FULL, undefined);
  });

  it("initializes with MODEL_ID_COMPACT when decide() reports modelTier 'compact' (Requirement 1: avoids OOM-crashing memory-constrained devices)", async () => {
    const decideFn = vi.fn(
      (): CompatibilityResult => ({
        webgpuAvailable: true,
        wasmAvailable: false,
        memoryGB: 4,
        selectedEngine: "webgpu",
        missingCapabilities: [],
        modelTier: "compact",
        shaderF16Available: true,
      }),
    );
    const { inferenceEngine, initialize } = createFakeInferenceEngine();

    renderWithProviders({ decideFn, createInferenceEngine: () => inferenceEngine });

    await waitFor(() => {
      expect(screen.getByTestId("engine-ready").textContent).toBe("true");
    });
    expect(initialize).toHaveBeenCalledWith("webgpu", MODEL_ID_COMPACT, 2048);
  });

  it("initializes with MODEL_ID_COMPACT_F32 when modelTier is 'compact' and shaderF16Available is false (Requirement 1: real-world bug -- WebGPU available but shader-f16 unsupported, e.g. some Android GPU drivers)", async () => {
    const decideFn = vi.fn(
      (): CompatibilityResult => ({
        webgpuAvailable: true,
        wasmAvailable: false,
        memoryGB: 4,
        selectedEngine: "webgpu",
        missingCapabilities: [],
        modelTier: "compact",
        shaderF16Available: false,
      }),
    );
    const { inferenceEngine, initialize } = createFakeInferenceEngine();

    renderWithProviders({ decideFn, createInferenceEngine: () => inferenceEngine });

    await waitFor(() => {
      expect(screen.getByTestId("engine-ready").textContent).toBe("true");
    });
    expect(initialize).toHaveBeenCalledWith("webgpu", MODEL_ID_COMPACT_F32, 2048);
    expect(screen.getByTestId("degraded-mode").textContent).toBe("null");
  });

  it("initializes with MODEL_ID_FULL_F32 when modelTier is 'full' and shaderF16Available is false", async () => {
    const decideFn = vi.fn(
      (): CompatibilityResult => ({
        webgpuAvailable: true,
        wasmAvailable: false,
        memoryGB: 8,
        selectedEngine: "webgpu",
        missingCapabilities: [],
        modelTier: "full",
        shaderF16Available: false,
      }),
    );
    const { inferenceEngine, initialize } = createFakeInferenceEngine();

    renderWithProviders({ decideFn, createInferenceEngine: () => inferenceEngine });

    await waitFor(() => {
      expect(screen.getByTestId("engine-ready").textContent).toBe("true");
    });
    expect(initialize).toHaveBeenCalledWith("webgpu", MODEL_ID_FULL_F32, undefined);
  });

  it("activates Degraded_Mode with a specific, actionable message when engine initialization fails with ShaderF16SupportError (defense in depth: the proactive shaderF16Available check itself failing to prevent this)", async () => {
    const decideFn = vi.fn(
      (): CompatibilityResult => ({
        webgpuAvailable: true,
        wasmAvailable: false,
        memoryGB: 8,
        selectedEngine: "webgpu",
        missingCapabilities: [],
        modelTier: "full",
        shaderF16Available: true,
      }),
    );
    const shaderF16Error = new Error(
      "This model requires WebGPU extension shader-f16, which is not enabled in this browser.",
    );
    shaderF16Error.name = "ShaderF16SupportError";
    const { inferenceEngine } = createFakeInferenceEngine({
      initialize: vi
        .fn()
        .mockRejectedValue(new EngineInitializationError("unsupported_gpu_feature", shaderF16Error)),
    });

    renderWithProviders({ decideFn, createInferenceEngine: () => inferenceEngine });

    await waitFor(() => {
      expect(screen.getByTestId("degraded-mode").textContent).not.toBe("null");
    });
    expect(screen.getByTestId("degraded-mode").textContent).toContain(
      "la GPU de este dispositivo no soporta una función gráfica necesaria",
    );
  });

  it("activates Degraded_Mode with a specific message when engine initialization fails with WebGPUNotAvailableError (Requirement 1: WebLLM's own internal GPU probe failing independently of ours)", async () => {
    const decideFn = vi.fn(
      (): CompatibilityResult => ({
        webgpuAvailable: true,
        wasmAvailable: false,
        memoryGB: 8,
        selectedEngine: "webgpu",
        missingCapabilities: [],
        modelTier: "full",
        shaderF16Available: true,
      }),
    );
    const webgpuUnavailableError = new Error("WebGPU is not supported in your current environment.");
    webgpuUnavailableError.name = "WebGPUNotAvailableError";
    const { inferenceEngine } = createFakeInferenceEngine({
      initialize: vi
        .fn()
        .mockRejectedValue(new EngineInitializationError("gpu_unavailable", webgpuUnavailableError)),
    });

    renderWithProviders({ decideFn, createInferenceEngine: () => inferenceEngine });

    await waitFor(() => {
      expect(screen.getByTestId("degraded-mode").textContent).not.toBe("null");
    });
    expect(screen.getByTestId("degraded-mode").textContent).toContain(
      "WebGPU dejó de estar disponible justo al momento de cargar el modelo",
    );
  });

  it("activates Degraded_Mode with cause insufficient_memory when engine initialization fails due to OOM (8.1)", async () => {
    const decideFn = vi.fn(
      (): CompatibilityResult => ({
        webgpuAvailable: true,
        wasmAvailable: false,
        memoryGB: 8,
        selectedEngine: "webgpu",
        missingCapabilities: [],
        modelTier: "full",
        shaderF16Available: true,
      }),
    );
    const { inferenceEngine } = createFakeInferenceEngine({
      initialize: vi.fn().mockRejectedValue(new EngineInitializationError("insufficient_memory", new Error("oom"))),
    });

    renderWithProviders({ decideFn, createInferenceEngine: () => inferenceEngine });

    await waitFor(() => {
      expect(screen.getByTestId("degraded-mode").textContent).not.toBe("null");
    });
    expect(screen.getByTestId("degraded-mode").textContent).toContain("memoria suficiente");
    expect(screen.getByTestId("engine-ready").textContent).toBe("false");
  });

  it("activates Degraded_Mode with cause other_cause when engine initialization fails for another reason (8.5)", async () => {
    const decideFn = vi.fn(
      (): CompatibilityResult => ({
        webgpuAvailable: true,
        wasmAvailable: false,
        memoryGB: 8,
        selectedEngine: "webgpu",
        missingCapabilities: [],
        modelTier: "full",
        shaderF16Available: true,
      }),
    );
    const { inferenceEngine } = createFakeInferenceEngine({
      initialize: vi.fn().mockRejectedValue(new EngineInitializationError("other_cause", new Error("network"))),
    });

    renderWithProviders({ decideFn, createInferenceEngine: () => inferenceEngine });

    await waitFor(() => {
      expect(screen.getByTestId("degraded-mode").textContent).not.toBe("null");
    });
    expect(screen.getByTestId("degraded-mode").textContent).toContain(
      "El asistente no pudo inicializarse.",
    );
  });

  it("activates Degraded_Mode with cause other_cause when engine initialization fails with an untyped error", async () => {
    const decideFn = vi.fn(
      (): CompatibilityResult => ({
        webgpuAvailable: true,
        wasmAvailable: false,
        memoryGB: 8,
        selectedEngine: "webgpu",
        missingCapabilities: [],
        modelTier: "full",
        shaderF16Available: true,
      }),
    );
    const { inferenceEngine } = createFakeInferenceEngine({
      initialize: vi.fn().mockRejectedValue(new Error("fallo inesperado")),
    });

    renderWithProviders({ decideFn, createInferenceEngine: () => inferenceEngine });

    await waitFor(() => {
      expect(screen.getByTestId("degraded-mode").textContent).not.toBe("null");
    });
    expect(screen.getByTestId("degraded-mode").textContent).toContain(
      "El asistente no pudo inicializarse.",
    );
  });

  it("activates Degraded_Mode with cause network_error when engine initialization fails to fetch the model", async () => {
    const decideFn = vi.fn(
      (): CompatibilityResult => ({
        webgpuAvailable: true,
        wasmAvailable: false,
        memoryGB: 8,
        selectedEngine: "webgpu",
        missingCapabilities: [],
        modelTier: "full",
        shaderF16Available: true,
      }),
    );
    const { inferenceEngine } = createFakeInferenceEngine({
      initialize: vi
        .fn()
        .mockRejectedValue(new EngineInitializationError("network_error", new Error("Failed to fetch"))),
    });

    renderWithProviders({ decideFn, createInferenceEngine: () => inferenceEngine });

    await waitFor(() => {
      expect(screen.getByTestId("degraded-mode").textContent).not.toBe("null");
    });
    expect(screen.getByTestId("degraded-mode").textContent).toContain("No se pudo descargar el modelo de IA");
  });

  it("activates Degraded_Mode with cause unsupported_gpu_limits and a device-specific message when the GPU/driver doesn't meet WebLLM's WebGPU limits (a real Mali/Adreno mobile-driver failure mode)", async () => {
    const decideFn = vi.fn(
      (): CompatibilityResult => ({
        webgpuAvailable: true,
        wasmAvailable: false,
        memoryGB: 8,
        selectedEngine: "webgpu",
        missingCapabilities: [],
        modelTier: "full",
        shaderF16Available: true,
      }),
    );
    const gpuLimitError = new Error(
      "Cannot initialize runtime because of requested maxStorageBuffersPerShaderStage exceeds limit. requested=10, limit=8. ",
    );
    const { inferenceEngine } = createFakeInferenceEngine({
      initialize: vi.fn().mockRejectedValue(new EngineInitializationError("unsupported_gpu_limits", gpuLimitError)),
    });

    renderWithProviders({ decideFn, createInferenceEngine: () => inferenceEngine });

    await waitFor(() => {
      expect(screen.getByTestId("degraded-mode").textContent).not.toBe("null");
    });
    expect(screen.getByTestId("degraded-mode").textContent).toContain(
      "no cumple los límites mínimos que necesita el motor de IA",
    );
  });

  it("includes the raw underlying error as 'detail' on an engine_init_failure, so it can be shown on-device without devtools (App.tsx's 'Detalles técnicos')", async () => {
    const decideFn = vi.fn(
      (): CompatibilityResult => ({
        webgpuAvailable: true,
        wasmAvailable: false,
        memoryGB: 8,
        selectedEngine: "webgpu",
        missingCapabilities: [],
        modelTier: "full",
        shaderF16Available: true,
      }),
    );
    const originalError = new Error("Out of memory while allocating buffer");
    const { inferenceEngine } = createFakeInferenceEngine({
      initialize: vi.fn().mockRejectedValue(new EngineInitializationError("insufficient_memory", originalError)),
    });

    renderWithProviders({ decideFn, createInferenceEngine: () => inferenceEngine });

    await waitFor(() => {
      expect(screen.getByTestId("degraded-mode-detail").textContent).not.toBe("null");
    });
    expect(screen.getByTestId("degraded-mode-detail").textContent).toContain("Out of memory while allocating buffer");
  });

  it("activates Degraded_Mode when ensureModelAvailable() fails definitively (8.4)", async () => {
    const decideFn = vi.fn(
      (): CompatibilityResult => ({
        webgpuAvailable: true,
        wasmAvailable: false,
        memoryGB: 8,
        selectedEngine: "webgpu",
        missingCapabilities: [],
        modelTier: "full",
        shaderF16Available: true,
      }),
    );
    const { inferenceEngine, initialize } = createFakeInferenceEngine();
    const modelDownloadManager = {
      ensureModelAvailable: vi.fn().mockRejectedValue(new ModelDownloadError("aborted")),
    };

    renderWithProviders({ decideFn, createInferenceEngine: () => inferenceEngine, modelDownloadManager });

    await waitFor(() => {
      expect(screen.getByTestId("degraded-mode").textContent).not.toBe("null");
    });
    expect(screen.getByTestId("degraded-mode").textContent).toContain("descarga del modelo no pudo completarse");
    // Engine initialization must not be attempted if the download failed.
    expect(initialize).not.toHaveBeenCalled();
  });

  it("does not activate Degraded_Mode when ensureModelAvailable() resolves successfully (2.1, 2.5)", async () => {
    const decideFn = vi.fn(
      (): CompatibilityResult => ({
        webgpuAvailable: true,
        wasmAvailable: false,
        memoryGB: 8,
        selectedEngine: "webgpu",
        missingCapabilities: [],
        modelTier: "full",
        shaderF16Available: true,
      }),
    );
    const { inferenceEngine } = createFakeInferenceEngine();
    const modelDownloadManager = {
      ensureModelAvailable: vi.fn().mockResolvedValue(undefined),
    };

    renderWithProviders({ decideFn, createInferenceEngine: () => inferenceEngine, modelDownloadManager });

    await waitFor(() => {
      expect(screen.getByTestId("engine-ready").textContent).toBe("true");
    });
    expect(screen.getByTestId("degraded-mode").textContent).toBe("null");
    expect(modelDownloadManager.ensureModelAvailable).toHaveBeenCalledTimes(1);
  });

  it("publishes an error notification alongside Degraded_Mode activation", async () => {
    const decideFn = vi.fn(
      (): CompatibilityResult => ({
        webgpuAvailable: false,
        wasmAvailable: false,
        memoryGB: 8,
        selectedEngine: "none",
        missingCapabilities: ["webgpu", "wasm"],
        modelTier: "full",
        shaderF16Available: true,
      }),
    );

    render(
      <NotificationProvider>
        <AppStateProvider
          detectFn={vi.fn().mockResolvedValue(ANY_PROBE)}
          decideFn={decideFn}
          createConversationManager={createTestConversationManager}
          modelDownloadManager={createTestModelDownloadManager()}
        >
          <AppStateProbe />
        </AppStateProvider>
      </NotificationProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
  });
});

describe("AppStateProvider - previous-session crash detection (sessionDiagnostics)", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    window.sessionStorage.clear();
  });

  it("shows a notification when the previous session left the 'generating' marker set with no known reload reason (likely a crash mid-generation)", async () => {
    markGenerationStarted();
    const { inferenceEngine } = createFakeInferenceEngine();

    renderWithProviders({ decideFn: decide, createInferenceEngine: () => inferenceEngine });

    await waitFor(() => {
      expect(screen.getByTestId("engine-ready").textContent).toBe("true");
    });
    const alerts = screen.getAllByRole("alert");
    expect(alerts.some((alert) => alert.textContent.includes("se reinició"))).toBe(true);
  });

  it("shows no crash notification on a normal boot (nothing marked)", async () => {
    const { inferenceEngine } = createFakeInferenceEngine();

    renderWithProviders({ decideFn: decide, createInferenceEngine: () => inferenceEngine });

    await waitFor(() => {
      expect(screen.getByTestId("engine-ready").textContent).toBe("true");
    });
    expect(screen.queryAllByRole("alert")).toHaveLength(0);
  });
});

describe("AppStateProvider - useAppState()", () => {
  it("throws a descriptive error if useAppState() is used outside the provider", () => {
    function ComponentWithoutProvider() {
      useAppState();
      return null;
    }

    expect(() => render(<ComponentWithoutProvider />)).toThrow(
      /useAppState\(\) must be used within an <AppStateProvider>/,
    );
  });
});

describe("AppStateProvider - block initial load when offline (3.5)", () => {
  const decideFnWithEngine = vi.fn(
    (): CompatibilityResult => ({
      webgpuAvailable: true,
      wasmAvailable: false,
      memoryGB: 8,
      selectedEngine: "webgpu",
      missingCapabilities: [],
      modelTier: "full",
      shaderF16Available: true,
    }),
  );

  it("activates Degraded_Mode with cause 'no_connection_initial_load' when the browser is offline and ensureModelAvailable() fails", async () => {
    const { inferenceEngine, initialize } = createFakeInferenceEngine();
    const modelDownloadManager = {
      ensureModelAvailable: vi.fn().mockRejectedValue(new ModelDownloadError("aborted")),
    };

    renderWithProviders({
      decideFn: decideFnWithEngine,
      createInferenceEngine: () => inferenceEngine,
      modelDownloadManager,
      isBrowserOnline: () => false,
    });

    await waitFor(() => {
      expect(screen.getByTestId("degraded-mode").textContent).not.toBe("null");
    });
    expect(screen.getByTestId("degraded-mode").textContent).toContain(
      "La carga inicial de la aplicación requiere conexión a internet",
    );
    expect(initialize).not.toHaveBeenCalled();
  });

  it("activates Degraded_Mode with the generic download-failure message when the browser IS online (8.4)", async () => {
    const { inferenceEngine } = createFakeInferenceEngine();
    const modelDownloadManager = {
      ensureModelAvailable: vi.fn().mockRejectedValue(new ModelDownloadError("invalid_integrity")),
    };

    renderWithProviders({
      decideFn: decideFnWithEngine,
      createInferenceEngine: () => inferenceEngine,
      modelDownloadManager,
      isBrowserOnline: () => true,
    });

    await waitFor(() => {
      expect(screen.getByTestId("degraded-mode").textContent).not.toBe("null");
    });
    expect(screen.getByTestId("degraded-mode").textContent).toContain("La descarga del modelo no pudo completarse");
  });

  it("does NOT report 'no_connection_initial_load' when offline AND the engine init failure is a real device-capability cause (insufficient_memory) -- reporting 'necesitás conexión' there would be misleading (regression: previously ANY offline init failure was reported as a connectivity issue)", async () => {
    const { inferenceEngine } = createFakeInferenceEngine({
      initialize: vi
        .fn()
        .mockRejectedValue(new EngineInitializationError("insufficient_memory", new Error("Out of memory"))),
    });

    renderWithProviders({
      decideFn: decideFnWithEngine,
      createInferenceEngine: () => inferenceEngine,
      isBrowserOnline: () => false,
    });

    await waitFor(() => {
      expect(screen.getByTestId("degraded-mode").textContent).not.toBe("null");
    });
    expect(screen.getByTestId("degraded-mode").textContent).toContain("memoria suficiente");
    expect(screen.getByTestId("degraded-mode").textContent).not.toContain("requiere conexión a internet");
  });

  it("still reports 'no_connection_initial_load' when offline and the init failure classifies as network_error (the connectivity message remains correct for its actual cause)", async () => {
    const { inferenceEngine } = createFakeInferenceEngine({
      initialize: vi
        .fn()
        .mockRejectedValue(new EngineInitializationError("network_error", new Error("Failed to fetch"))),
    });

    renderWithProviders({
      decideFn: decideFnWithEngine,
      createInferenceEngine: () => inferenceEngine,
      isBrowserOnline: () => false,
    });

    await waitFor(() => {
      expect(screen.getByTestId("degraded-mode").textContent).not.toBe("null");
    });
    expect(screen.getByTestId("degraded-mode").textContent).toContain(
      "La carga inicial de la aplicación requiere conexión a internet",
    );
  });
});

describe("AppStateProvider - model download/caching delegated to WebLLM by default", () => {
  it("does not invoke any own ModelDownloadManager when not explicitly injected: inferenceEngine.initialize() is called directly", async () => {
    const decideFn = vi.fn(
      (): CompatibilityResult => ({
        webgpuAvailable: true,
        wasmAvailable: false,
        memoryGB: 8,
        selectedEngine: "webgpu",
        missingCapabilities: [],
        modelTier: "full",
        shaderF16Available: true,
      }),
    );
    const { inferenceEngine, initialize } = createFakeInferenceEngine();

    // Without an injected `modelDownloadManager`, our own ensuring step is
    // skipped entirely: WebLLM (inferenceEngine.initialize()) is the one
    // that downloads/caches the model weights internally. There must be no
    // attempt at a `fetch`/Cache API of this provider's own.
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(
      <NotificationProvider>
        <AppStateProvider
          detectFn={vi.fn().mockResolvedValue(ANY_PROBE)}
          decideFn={decideFn}
          createConversationManager={createTestConversationManager}
          createInferenceEngine={() => inferenceEngine}
          isBrowserOnline={() => true}
        >
          <AppStateProbe />
        </AppStateProvider>
      </NotificationProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("engine-ready").textContent).toBe("true");
    });
    expect(screen.getByTestId("degraded-mode").textContent).toBe("null");
    expect(initialize).toHaveBeenCalledWith("webgpu", MODEL_ID_FULL, undefined);
    expect(fetchMock).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it("activates Degraded_Mode with the connection-required message when inferenceEngine.initialize() fails while offline", async () => {
    const decideFn = vi.fn(
      (): CompatibilityResult => ({
        webgpuAvailable: true,
        wasmAvailable: false,
        memoryGB: 8,
        selectedEngine: "webgpu",
        missingCapabilities: [],
        modelTier: "full",
        shaderF16Available: true,
      }),
    );
    const { inferenceEngine } = createFakeInferenceEngine({
      initialize: vi.fn().mockRejectedValue(new Error("fallo de red al descargar el modelo")),
    });

    renderWithProviders({
      decideFn,
      createInferenceEngine: () => inferenceEngine,
      isBrowserOnline: () => false,
    });

    await waitFor(() => {
      expect(screen.getByTestId("degraded-mode").textContent).not.toBe("null");
    });
    expect(screen.getByTestId("degraded-mode").textContent).toContain(
      "La carga inicial de la aplicación requiere conexión a internet",
    );
  });
});
