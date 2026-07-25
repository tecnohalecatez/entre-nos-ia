// End-to-end integration tests for the messaging flow and app boot (task 22.3).
//
// Unlike the unit/light-integration suites from earlier tasks -- which
// exercise `useSendMessage` in isolation (`useSendMessage.test.tsx`, task
// 22.1) or specific components combined in minimal harnesses
// (`messagingFlow.test.tsx`, task 17.4; `AppStateProvider.test.tsx`, task
// 22.2) -- this suite mounts the REAL, full component tree
// (`NotificationProvider` > `AppStateProvider` > the equivalent of
// `App.tsx`'s `AppContent`/`ChatInterface`) and interacts with it
// exclusively through the real DOM (typing into `MessageInput`'s real
// `textarea`, clicking the real "Enviar"/"Cancelar"/"Reintentar" buttons,
// observing `MessageHistory` and `ConversationList` react).
//
// `App.tsx` doesn't expose `AppStateProvider`'s injectable dependencies
// (`detectFn`, `decideFn`, `createInferenceEngine`, `modelDownloadManager`,
// `isBrowserOnline`) as its own props -- by design, that root component
// always uses the production implementations. That's why the same tree
// `App.tsx` composes is manually rebuilt here (`NotificationProvider` >
// `AppStateProvider` > `degradedMode`/`loading`/`ChatInterface` routing, see
// `TestAppContent` below, identical to `App.tsx`'s internal `AppContent`)
// injecting the necessary dependencies, instead of modifying production
// code to expose them.
//
// `InferenceEngine` is simulated with controlled async generators
// (following `useSendMessage.test.tsx`'s pattern); `ConversationStore` uses
// the real `ConversationStoreDexie` implementation over `fake-indexeddb`
// (same pattern as the rest of the Chat_Interface suite).
//
// See .kiro/specs/asistente-ia-local/requirements.md (1.4, 1.5, 1.6, 3.4,
// 3.5, 3.6, 4.1, 4.2, 4.3, 4.5, 4.9, 5.1, 8.2, 11.4, 11.5).

import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NotificationProvider } from "./notification";
import { AppStateProvider } from "./app-state/AppStateProvider";
import type { AppStateProviderProps } from "./app-state/AppStateProvider";
import { ThemeProvider } from "./theme";
import { useAppState } from "./app-state/useAppState";
import { degradedModeMessage } from "./app-state/degradedMode";
import { isInStandaloneMode } from "./app-state/standaloneMode";
import { ChatInterface } from "./chat-interface/ChatInterface";
import { ConversationManager } from "./conversation-manager/ConversationManager";
import { ConversationStoreDexie } from "./conversation-store/ConversationStore";
import { ModelDownloadError } from "./model-download-manager/ensureModelAvailable";
import type { ModelDownloadManager } from "./model-download-manager/ensureModelAvailable";
import type { InferenceEngine } from "./inference-engine/InferenceEngine";
import type { DecideInput, CompatibilityResult } from "./compatibility-detector/decide";

beforeEach(() => {
  // fake-indexeddb doesn't isolate automatically between tests (same
  // pattern as the rest of the suites using `ConversationStoreDexie`).
  indexedDB.deleteDatabase("ConversationStore");
});

/**
 * Minimal test-only reconstruction of `App.tsx`'s internal `AppContent`:
 * routes between Degraded_Mode, the loading state, and the assembled
 * Chat_Interface, with exactly the same logic (see `App.tsx`). Duplicated
 * here -- instead of modifying `App.tsx` to export it -- because this task
 * is test-only and must not touch production code.
 */
function TestAppContent() {
  const { degradedMode, loading } = useAppState();

  if (degradedMode !== null) {
    return (
      <section id="degraded-mode" role="alert">
        <h1>Asistente no disponible</h1>
        <p>{degradedModeMessage(degradedMode)}</p>
      </section>
    );
  }
  if (loading) {
    return (
      <section id="loading">
        <p>Preparando el asistente…</p>
      </section>
    );
  }
  return <ChatInterface />;
}

function renderTestApp(props: Partial<AppStateProviderProps> = {}) {
  return render(
    <ThemeProvider>
      <NotificationProvider>
        <AppStateProvider {...(props as AppStateProviderProps)}>
          <TestAppContent />
        </AppStateProvider>
      </NotificationProvider>
    </ThemeProvider>,
  );
}

/** Waits for `AppStateProvider`'s boot sequence to finish (success or Degraded_Mode). */
async function waitForBootToFinish(): Promise<void> {
  await waitFor(() => {
    expect(screen.queryByText(/preparando el asistente/i)).not.toBeInTheDocument();
  });
}

function createTestConversationManager(): ConversationManager {
  return new ConversationManager(new ConversationStoreDexie());
}

/** Test `ModelDownloadManager`: resolves immediately with no real I/O. */
function createTestModelDownloadManager(): ModelDownloadManager {
  return { ensureModelAvailable: vi.fn().mockResolvedValue(undefined) };
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

/**
 * Simulated inference engine that emits `chunks` incrementally with a small
 * real delay between each one (instead of just an `await
 * Promise.resolve()`), so this suite's incremental-streaming assertions can
 * reliably observe a real intermediate state via `waitFor` (unlike
 * `useSendMessage.test.tsx`, which operating over `renderHook`/`act`
 * doesn't need that delay).
 */
function createStreamingInferenceEngine(chunks: string[]): InferenceEngine {
  return createFakeInferenceEngine({
    generate: vi.fn().mockImplementation(
      () =>
        (async function* generateChunks(): AsyncIterable<string> {
          for (const chunk of chunks) {
            await new Promise((resolve) => setTimeout(resolve, 15));
            yield chunk;
          }
        })(),
    ),
  }).inferenceEngine;
}

const ANY_PROBE: DecideInput = { webgpuAvailable: true, wasmAvailable: true, memoryGB: 8 };

const WEBGPU_RESULT: CompatibilityResult = {
  webgpuAvailable: true,
  wasmAvailable: false,
  memoryGB: 8,
  selectedEngine: "webgpu",
  missingCapabilities: [],
};

const WASM_RESULT: CompatibilityResult = {
  webgpuAvailable: false,
  wasmAvailable: true,
  memoryGB: 8,
  selectedEngine: "wasm",
  missingCapabilities: [],
};

/** Types `text` into `MessageInput`'s real `textarea` and clicks "Enviar". */
async function typeAndSend(user: ReturnType<typeof userEvent.setup>, text: string): Promise<void> {
  const field = screen.getByRole("textbox", { name: "Mensaje" });
  await user.click(field);
  await user.paste(text);
  await user.click(screen.getByRole("button", { name: "Enviar" }));
}

describe("e2e integration - full messaging flow (4.1, 4.2, 4.3, 4.9, 5.1)", () => {
  it("automatically creates the conversation, streams the response incrementally, and persists both messages", async () => {
    const inferenceEngine = createStreamingInferenceEngine(["Hola", ", ", "mundo"]);

    renderTestApp({
      detectFn: vi.fn().mockResolvedValue(ANY_PROBE),
      decideFn: vi.fn().mockReturnValue(WEBGPU_RESULT),
      createInferenceEngine: () => inferenceEngine,
      createConversationManager: createTestConversationManager,
      modelDownloadManager: createTestModelDownloadManager(),
    });

    await waitForBootToFinish();

    // Initial state: no conversations, engine ready (no "preparing" message).
    expect(screen.getByTestId("conversation-list-empty")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Mensaje" })).toBeInTheDocument();

    const user = userEvent.setup();
    await typeAndSend(user, "hola mundo");

    // Incremental streaming (4.2): a partial chunk is observed before
    // generation completes.
    await waitFor(() => {
      expect(screen.getByRole("article", { name: "Generando respuesta" })).toHaveTextContent("Hola");
    });

    // Completion (4.3): the ephemeral bubble disappears once complete.
    await waitFor(
      () => {
        expect(screen.queryByRole("article", { name: "Generando respuesta" })).not.toBeInTheDocument();
      },
      { timeout: 3000 },
    );

    // Persistence (5.1): the user Message and the assistant Message end up
    // as real history Messages (not ephemeral bubbles). The search is
    // scoped to the history ("log") because the same user Message text also
    // appears as the conversation's label in `ConversationList` (4.9). The
    // assistant Message's persistence (addMessage + reloadConversations)
    // happens after the "complete" dispatch, asynchronously, so it's
    // awaited explicitly.
    const history = screen.getByRole("log", { name: "Historial de mensajes" });
    expect(within(history).getByText("hola mundo")).toBeInTheDocument();
    await waitFor(() => {
      expect(within(history).getByText("Hola, mundo")).toBeInTheDocument();
    });

    // Automatic Conversation creation (4.9): the list is no longer empty.
    expect(screen.queryByTestId("conversation-list-empty")).not.toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Conversaciones" })).toBeInTheDocument();
  });
});

describe("e2e integration - sending a message with Enter", () => {
  it("pressing Enter on the real textarea sends the message, exactly like clicking Enviar", async () => {
    const inferenceEngine = createStreamingInferenceEngine(["Hola", ", ", "mundo"]);

    renderTestApp({
      detectFn: vi.fn().mockResolvedValue(ANY_PROBE),
      decideFn: vi.fn().mockReturnValue(WEBGPU_RESULT),
      createInferenceEngine: () => inferenceEngine,
      createConversationManager: createTestConversationManager,
      modelDownloadManager: createTestModelDownloadManager(),
    });

    await waitForBootToFinish();

    const user = userEvent.setup();
    const field = screen.getByRole("textbox", { name: "Mensaje" });
    await user.type(field, "hola mundo{Enter}");

    // Confirms generation actually started (Enter really triggered onSend)
    // before checking it finished, mirroring `typeAndSend`'s assertions.
    await waitFor(() => {
      expect(screen.getByRole("article", { name: "Generando respuesta" })).toHaveTextContent("Hola");
    });

    await waitFor(
      () => {
        expect(screen.queryByRole("article", { name: "Generando respuesta" })).not.toBeInTheDocument();
      },
      { timeout: 3000 },
    );

    const history = screen.getByRole("log", { name: "Historial de mensajes" });
    expect(within(history).getByText("hola mundo")).toBeInTheDocument();
    await waitFor(() => {
      expect(within(history).getByText("Hola, mundo")).toBeInTheDocument();
    });
  });
});

describe("e2e integration - generation error and retry (8.2)", () => {
  it("shows the error state after a generation failure and persists the response on retry", async () => {
    let attemptNumber = 0;
    const { inferenceEngine } = createFakeInferenceEngine({
      generate: vi.fn().mockImplementation(() => {
        attemptNumber += 1;
        if (attemptNumber === 1) {
          return (async function* (): AsyncIterable<string> {
            await new Promise((resolve) => setTimeout(resolve, 10));
            yield "Hola";
            throw new Error("fallo de generación simulado");
          })();
        }
        return (async function* (): AsyncIterable<string> {
          await new Promise((resolve) => setTimeout(resolve, 10));
          yield "respuesta ";
          yield "reintentada";
        })();
      }),
    });

    renderTestApp({
      detectFn: vi.fn().mockResolvedValue(ANY_PROBE),
      decideFn: vi.fn().mockReturnValue(WEBGPU_RESULT),
      createInferenceEngine: () => inferenceEngine,
      createConversationManager: createTestConversationManager,
      modelDownloadManager: createTestModelDownloadManager(),
    });

    await waitForBootToFinish();

    const user = userEvent.setup();
    await typeAndSend(user, "mensaje que falla");

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
    });
    // The centralized error notification is shown alongside the error state.
    expect(screen.getByRole("alert")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reintentar" }));

    const history = screen.getByRole("log", { name: "Historial de mensajes" });
    await waitFor(() => {
      expect(within(history).getByText("respuesta reintentada")).toBeInTheDocument();
    });

    // The original user Message isn't duplicated in the history: it still
    // appears exactly once (the same text also appears as the
    // conversation's label in `ConversationList`, outside the history).
    expect(within(history).getAllByText("mensaje que falla")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Reintentar" })).not.toBeInTheDocument();
  });
});

describe("e2e integration - cancelling an in-progress generation (4.5)", () => {
  it("clicking Cancelar persists the partial text generated up to that point as a real Message", async () => {
    let resolveCancellationWait: (() => void) | undefined;
    const cancellationWait = new Promise<void>((resolve) => {
      resolveCancellationWait = resolve;
    });

    const { inferenceEngine } = createFakeInferenceEngine({
      generate: vi.fn().mockImplementation(
        () =>
          (async function* (): AsyncIterable<string> {
            await new Promise((resolve) => setTimeout(resolve, 10));
            yield "Texto parc";
            // In the real integration, WebLLM reflects cancellation by
            // simply no longer emitting chunks on the same AsyncIterable
            // (see the design note in `useSendMessage.ts`); here it's
            // simulated by waiting for the real click on "Cancelar" (which
            // invokes `inferenceEngine.cancel()`, resolving this promise)
            // to let the generator finish with no more chunks.
            await cancellationWait;
          })(),
      ),
      cancel: vi.fn(() => {
        resolveCancellationWait?.();
      }),
    });

    renderTestApp({
      detectFn: vi.fn().mockResolvedValue(ANY_PROBE),
      decideFn: vi.fn().mockReturnValue(WEBGPU_RESULT),
      createInferenceEngine: () => inferenceEngine,
      createConversationManager: createTestConversationManager,
      modelDownloadManager: createTestModelDownloadManager(),
    });

    await waitForBootToFinish();

    const user = userEvent.setup();
    await typeAndSend(user, "hola, generá algo largo");

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Cancelar" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    // The partial text is retained and persisted as a real Message (no
    // longer as a "generating" ephemeral bubble).
    await waitFor(() => {
      expect(screen.getByText("Texto parc")).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: "Cancelar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "Generando respuesta" })).not.toBeInTheDocument();
  });
});

describe("e2e integration - online/offline boot scenarios with and without prior cache (1.4, 1.5, 1.6, 3.4, 3.5, 3.6)", () => {
  it("boots successfully online when the model download completes, selecting WebGPU (1.4, 1.6)", async () => {
    const { inferenceEngine } = createFakeInferenceEngine();

    renderTestApp({
      detectFn: vi.fn().mockResolvedValue(ANY_PROBE),
      decideFn: vi.fn().mockReturnValue(WEBGPU_RESULT),
      createInferenceEngine: () => inferenceEngine,
      createConversationManager: createTestConversationManager,
      modelDownloadManager: createTestModelDownloadManager(),
      isBrowserOnline: () => true,
    });

    await waitForBootToFinish();

    expect(screen.getByText("WebGPU")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Mensaje" })).toBeInTheDocument();
  });

  it("boots successfully online selecting WebAssembly when decide() determines so (1.5, 1.6)", async () => {
    const { inferenceEngine } = createFakeInferenceEngine();

    renderTestApp({
      detectFn: vi.fn().mockResolvedValue(ANY_PROBE),
      decideFn: vi.fn().mockReturnValue(WASM_RESULT),
      createInferenceEngine: () => inferenceEngine,
      createConversationManager: createTestConversationManager,
      modelDownloadManager: createTestModelDownloadManager(),
      isBrowserOnline: () => true,
    });

    await waitForBootToFinish();

    expect(screen.getByText("WebAssembly")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("boots successfully online when the model is already cached and verified, without blocking the rest of the flow (2.5 integrated)", async () => {
    const { inferenceEngine } = createFakeInferenceEngine();
    const ensureModelAvailable = vi.fn().mockResolvedValue(undefined);

    renderTestApp({
      detectFn: vi.fn().mockResolvedValue(ANY_PROBE),
      decideFn: vi.fn().mockReturnValue(WEBGPU_RESULT),
      createInferenceEngine: () => inferenceEngine,
      createConversationManager: createTestConversationManager,
      modelDownloadManager: { ensureModelAvailable },
      isBrowserOnline: () => true,
    });

    await waitForBootToFinish();

    expect(ensureModelAvailable).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("WebGPU")).toBeInTheDocument();
  });

  it("blocks boot with the specific connection-required message when offline and there's no cached model (3.5, 3.6)", async () => {
    const { inferenceEngine, initialize } = createFakeInferenceEngine();
    const modelDownloadManager: ModelDownloadManager = {
      ensureModelAvailable: vi.fn().mockRejectedValue(new ModelDownloadError("aborted")),
    };

    renderTestApp({
      detectFn: vi.fn().mockResolvedValue(ANY_PROBE),
      decideFn: vi.fn().mockReturnValue(WEBGPU_RESULT),
      createInferenceEngine: () => inferenceEngine,
      createConversationManager: createTestConversationManager,
      modelDownloadManager,
      isBrowserOnline: () => false,
    });

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Asistente no disponible" })).toBeInTheDocument();
    });

    // Specific "offline on initial load" message, distinct from the generic
    // download-failure one (see `degradedMode.ts`). Both the Degraded_Mode
    // section and the centralized notification (8.4) share `role="alert"`,
    // so all matches are used.
    const alerts = screen.getAllByRole("alert");
    expect(
      alerts.some((alert) =>
        alert.textContent.includes("La carga inicial de la aplicación requiere conexión a internet"),
      ),
    ).toBe(true);
    expect(initialize).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox", { name: "Mensaje" })).not.toBeInTheDocument();
  });

  it("boots successfully offline when the model is already cached, without blocking access (3.4, contrast with 3.5)", async () => {
    const { inferenceEngine, initialize } = createFakeInferenceEngine();
    const modelDownloadManager: ModelDownloadManager = {
      ensureModelAvailable: vi.fn().mockResolvedValue(undefined),
    };

    renderTestApp({
      detectFn: vi.fn().mockResolvedValue(ANY_PROBE),
      decideFn: vi.fn().mockReturnValue(WEBGPU_RESULT),
      createInferenceEngine: () => inferenceEngine,
      createConversationManager: createTestConversationManager,
      modelDownloadManager,
      isBrowserOnline: () => false,
    });

    await waitForBootToFinish();

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Mensaje" })).toBeInTheDocument();
    expect(initialize).toHaveBeenCalledWith("webgpu");
  });
});

describe("e2e integration - functional equivalence in Standalone_Mode across the full tree (11.4, 11.5)", () => {
  it("boots with the same successful result whether isInStandaloneMode() reports true", async () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);
    const { inferenceEngine } = createFakeInferenceEngine();

    renderTestApp({
      detectFn: vi.fn().mockResolvedValue(ANY_PROBE),
      decideFn: vi.fn().mockReturnValue(WEBGPU_RESULT),
      createInferenceEngine: () => inferenceEngine,
      createConversationManager: createTestConversationManager,
      modelDownloadManager: createTestModelDownloadManager(),
    });

    await waitForBootToFinish();

    expect(isInStandaloneMode()).toBe(true);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Mensaje" })).toBeInTheDocument();
    expect(screen.getByText("WebGPU")).toBeInTheDocument();

    vi.restoreAllMocks();
  });

  it("boots with the same successful result whether isInStandaloneMode() reports false (normal tab)", async () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: false } as MediaQueryList);
    const { inferenceEngine } = createFakeInferenceEngine();

    renderTestApp({
      detectFn: vi.fn().mockResolvedValue(ANY_PROBE),
      decideFn: vi.fn().mockReturnValue(WEBGPU_RESULT),
      createInferenceEngine: () => inferenceEngine,
      createConversationManager: createTestConversationManager,
      modelDownloadManager: createTestModelDownloadManager(),
    });

    await waitForBootToFinish();

    expect(isInStandaloneMode()).toBe(false);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Mensaje" })).toBeInTheDocument();
    expect(screen.getByText("WebGPU")).toBeInTheDocument();

    vi.restoreAllMocks();
  });
});
