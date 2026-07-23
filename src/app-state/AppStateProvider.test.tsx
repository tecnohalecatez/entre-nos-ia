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
import { beforeEach, describe, expect, it, vi } from "vitest";
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
import { ModelDownloadError } from "../model-download-manager/ensureModelAvailable";
import type { ModelDownloadManager } from "../model-download-manager/ensureModelAvailable";
import type { AppStateProviderProps } from "./AppStateProvider";

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
};

/** Test helper component: exposes the context state as rendered text. */
function AppStateProbe() {
  const { loading, degradedMode, engineReady, compatibility } = useAppState();
  return (
    <div>
      <p data-testid="loading">{String(loading)}</p>
      <p data-testid="engine-ready">{String(engineReady)}</p>
      <p data-testid="degraded-mode">{degradedMode === null ? "null" : degradedModeMessage(degradedMode)}</p>
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
      }),
    );

    renderWithProviders({ decideFn });

    await waitFor(() => {
      expect(screen.getByTestId("degraded-mode").textContent).not.toBe("null");
    });
    expect(screen.getByTestId("degraded-mode").textContent).toContain("webgpu, wasm");
    expect(screen.getByTestId("loading").textContent).toBe("false");
  });

  it("activates Degraded_Mode when decide() determines insufficient memory (1.8)", async () => {
    const decideFn = vi.fn(
      (): CompatibilityResult => ({
        webgpuAvailable: true,
        wasmAvailable: true,
        memoryGB: 2,
        selectedEngine: "none",
        missingCapabilities: ["memoria"],
      }),
    );

    renderWithProviders({ decideFn });

    await waitFor(() => {
      expect(screen.getByTestId("degraded-mode").textContent).not.toBe("null");
    });
    expect(screen.getByTestId("degraded-mode").textContent).toContain("memoria");
  });

  it("does NOT activate Degraded_Mode and marks engineReady when compatible and initialization succeeds", async () => {
    const decideFn = vi.fn(
      (): CompatibilityResult => ({
        webgpuAvailable: true,
        wasmAvailable: false,
        memoryGB: 8,
        selectedEngine: "webgpu",
        missingCapabilities: [],
      }),
    );
    const { inferenceEngine, initialize } = createFakeInferenceEngine();

    renderWithProviders({ decideFn, createInferenceEngine: () => inferenceEngine });

    await waitFor(() => {
      expect(screen.getByTestId("engine-ready").textContent).toBe("true");
    });
    expect(screen.getByTestId("degraded-mode").textContent).toBe("null");
    expect(screen.getByTestId("loading").textContent).toBe("false");
    expect(initialize).toHaveBeenCalledWith("webgpu");
  });

  it("activates Degraded_Mode with cause insufficient_memory when engine initialization fails due to OOM (8.1)", async () => {
    const decideFn = vi.fn(
      (): CompatibilityResult => ({
        webgpuAvailable: true,
        wasmAvailable: false,
        memoryGB: 8,
        selectedEngine: "webgpu",
        missingCapabilities: [],
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
      }),
    );
    const { inferenceEngine } = createFakeInferenceEngine({
      initialize: vi.fn().mockRejectedValue(new EngineInitializationError("other_cause", new Error("network"))),
    });

    renderWithProviders({ decideFn, createInferenceEngine: () => inferenceEngine });

    await waitFor(() => {
      expect(screen.getByTestId("degraded-mode").textContent).not.toBe("null");
    });
    expect(screen.getByTestId("degraded-mode").textContent).toBe(
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
      }),
    );
    const { inferenceEngine } = createFakeInferenceEngine({
      initialize: vi.fn().mockRejectedValue(new Error("fallo inesperado")),
    });

    renderWithProviders({ decideFn, createInferenceEngine: () => inferenceEngine });

    await waitFor(() => {
      expect(screen.getByTestId("degraded-mode").textContent).not.toBe("null");
    });
    expect(screen.getByTestId("degraded-mode").textContent).toBe(
      "El asistente no pudo inicializarse.",
    );
  });

  it("activates Degraded_Mode when ensureModelAvailable() fails definitively (8.4)", async () => {
    const decideFn = vi.fn(
      (): CompatibilityResult => ({
        webgpuAvailable: true,
        wasmAvailable: false,
        memoryGB: 8,
        selectedEngine: "webgpu",
        missingCapabilities: [],
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
    expect(initialize).toHaveBeenCalledWith("webgpu");
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
