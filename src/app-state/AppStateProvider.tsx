// App_State: Provider component that orchestrates the boot sequence and
// exposes the `AppStateContext` consumed by `useAppState()`.
//
// See .kiro/specs/asistente-ia-local/design.md ("Architecture", "Boot
// sequence") and requirements.md (1.3, 1.8, 3.5, 8.1, 8.4, 8.5, 10.6) for the
// detail of the sequence orchestrated here:
//
//   detect() -> decide() -> [if an engine is available] ensureModelAvailable()
//   -> InferenceEngine.initialize(engine) -> Chat_Interface enabled
//
// At any point in that sequence where no engine is available or an
// initialization fails, Degraded_Mode is activated (see `degradedMode.ts`).
//
// `modelDownloadManager` (tasks 16.1, 22.2): NOT invoked during real boot by
// default (stays `undefined`). WebLLM manages downloading and caching the
// model weights internally when `inferenceEngine.initialize()` is called
// (see `InferenceEngine.ts` and `src/app-state/configuration.ts`), covering
// Requirements 2.1, 2.3 and 2.5 without needing our own download/checksum
// pipeline against a single-file URL (WebLLM splits the weights into shards
// resolved internally from the model id, chosen per `modelIdForTier()`).
// The prop still exists as an
// injection point for tests (or for a future in-house download pipeline if
// the project were to ever host its own weights).
//
// DESIGN NOTE (Requirement 3.5, "block initial load when offline and no
// prior cache"): the part of 3.5 about the app's ASSETS (HTML/CSS/JS)
// doesn't require code in this file -- if those assets aren't precached in
// Cache_Assets and the browser is offline, the page's initial network
// request fails at the browser level before this component (or any React
// code) gets to run. The part of 3.5 about the MODEL: if the browser is
// offline and the weights aren't cached by WebLLM, engine initialization
// fails (`inferenceEngine.initialize()` rejects), which activates
// Degraded_Mode via the 8.1/8.5 wiring (task 16.1); here that specific cause
// (offline) is distinguished with a more specific message.

import { useEffect, useMemo, useReducer, useState, useCallback } from "react";
import type { ReactNode } from "react";
import { detect } from "../compatibility-detector/detect";
import { decide } from "../compatibility-detector/decide";
import type { CompatibilityResult } from "../compatibility-detector/decide";
import {
  InferenceEngineWebLLM,
  createDefaultMlcEngineFactory,
  EngineInitializationError,
} from "../inference-engine/InferenceEngine";
import type {
  MlcEngineFactory,
  InferenceEngine,
  InitializationProgressReport,
  EngineInitializationFailureCause,
} from "../inference-engine/InferenceEngine";
import { reduceGeneration } from "../inference-engine/reduceGeneration";
import type { GenerationState } from "../inference-engine/reduceGeneration";
import { ConversationManager } from "../conversation-manager/ConversationManager";
import { ConversationStoreDexie } from "../conversation-store/ConversationStore";
import { ModelDownloadError } from "../model-download-manager/ensureModelAvailable";
import type { ModelDownloadManager } from "../model-download-manager/ensureModelAvailable";
import type { Conversation, Message } from "../types/models";
import { useNotification } from "../notification/useNotification";
import { AppStateContext } from "./context";
import type { DegradedModeCause } from "./degradedMode";
import { causeFromIncompatibility, degradedModeMessage } from "./degradedMode";
import { modelIdForTier, contextWindowSizeForTier } from "./configuration";
import { parseModelLoadProgress } from "./modelLoadProgress";
import type { ModelLoadProgress } from "./modelLoadProgress";
import {
  takePreviousSessionSignal,
  markLoadingStarted,
  markLoadingFinished,
  recordLoadCrash,
  resetLoadCrashCount,
} from "./sessionDiagnostics";

/** Truncation length for `DegradedModeCause`'s `detail` field (App.tsx's "Detalles técnicos"). */
const ERROR_DETAIL_MAX_LENGTH = 300;

const PREVIOUS_SESSION_CRASHED_TEXT =
  "La app se reinició justo mientras generaba una respuesta. Es posible que el dispositivo se haya quedado sin memoria.";

const LOAD_INTERRUPTED_RETRY_TEXT =
  "La carga anterior del modelo de IA se interrumpió inesperadamente, posiblemente por falta de memoria. Reintentando…";

/**
 * How many CONSECUTIVE crashes while loading the model (`"crashed_while_loading"`,
 * `sessionDiagnostics.ts`) are tolerated before giving up on auto-retrying
 * and surfacing `repeated_load_crash` instead (`degradedMode.ts`). `1` would
 * mean never retrying even once after a possibly-transient crash; this
 * gives it one silent retry (with a heads-up notification) before treating
 * it as a real, repeatable device limitation.
 */
const LOAD_CRASH_THRESHOLD = 2;

/**
 * Builds the raw `${name}: ${message}` description shown in the "Detalles
 * técnicos" section of the Degraded_Mode screen (`App.tsx`), so a device
 * without accessible devtools (a phone, a tablet) can report the real
 * underlying error instead of only the generic Spanish message. This is the
 * exact same information already sent to `console.error` just above each
 * call site -- never transmitted anywhere (Requisito 6), just also
 * rendered, locally, on the device that hit it.
 */
function describeErrorDetail(error: unknown): string {
  const description = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return description.length > ERROR_DETAIL_MAX_LENGTH
    ? `${description.slice(0, ERROR_DETAIL_MAX_LENGTH)}…`
    : description;
}

export interface AppStateProviderProps {
  children: ReactNode;
  /**
   * Injectable dependencies, mainly for tests: production defaults are used
   * by default (task 16.1, 22.2).
   */
  detectFn?: typeof detect;
  decideFn?: typeof decide;
  createInferenceEngine?: (onProgress: (report: InitializationProgressReport) => void) => InferenceEngine;
  createConversationManager?: () => ConversationManager;
  /**
   * Defaults to `createDefaultModelDownloadManager()` (real fetch/Cache
   * API). Injectable for tests, which must always provide a double (there's
   * no way to "skip" the model-ensuring step from this prop; to do that,
   * inject a `ModelDownloadManager` whose `ensureModelAvailable()` resolves
   * immediately).
   */
  modelDownloadManager?: ModelDownloadManager;
  /**
   * Function reporting whether the browser has network connectivity, used
   * to distinguish the "offline" cause from a model-download failure
   * (Requirement 3.5). Injectable for tests; defaults to reading
   * `navigator.onLine`.
   */
  isBrowserOnline?: () => boolean;
}

/**
 * `MlcEngineFactory` that imports `@mlc-ai/web-llm` lazily (dynamic import)
 * instead of at module scope. The WebLLM SDK adds several MB to the bundle;
 * importing it statically would bloat the Service_Worker_App's asset
 * precache (Cache_Assets) with a file that isn't even needed until the
 * engine is actually initialized (`initialize()`, only invoked once
 * `decide()` has determined an inference mechanism is available).
 */
const deferredMlcEngineFactory: MlcEngineFactory = async (modelId, engine, options) => {
  const { CreateMLCEngine } = await import("@mlc-ai/web-llm");
  return createDefaultMlcEngineFactory(CreateMLCEngine)(modelId, engine, options);
};

function createDefaultInferenceEngine(onProgress: (report: InitializationProgressReport) => void): InferenceEngine {
  return new InferenceEngineWebLLM(deferredMlcEngineFactory, onProgress);
}

function createDefaultConversationManager(): ConversationManager {
  return new ConversationManager(new ConversationStoreDexie());
}

/**
 * Minimal indirection over `AbortSignal.aborted`. TypeScript, when narrowing
 * types within the same function where the `AbortController` is created,
 * can't see that `controller.abort()` (invoked in the effect's cleanup)
 * happens in a different closure, and treats `signal.aborted` as always
 * `false`. Isolating the read in a separate module-level function avoids
 * that false positive without disabling the lint rule.
 */
function isCancelled(signal: AbortSignal): boolean {
  return signal.aborted;
}

/**
 * Root Provider for the `AppStateContext`. Orchestrates the boot sequence
 * (compatibility detection, model ensuring, Inference_Engine
 * initialization) and activates Degraded_Mode when appropriate (1.3, 1.8,
 * 3.5, 8.1, 8.4, 8.5, 10.6).
 */
export function AppStateProvider({
  children,
  detectFn = detect,
  decideFn = decide,
  createInferenceEngine = createDefaultInferenceEngine,
  createConversationManager = createDefaultConversationManager,
  modelDownloadManager: modelDownloadManagerProp,
  isBrowserOnline = () => navigator.onLine,
}: AppStateProviderProps) {
  const { showNotification } = useNotification();

  const [compatibility, setCompatibility] = useState<CompatibilityResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [degradedMode, setDegradedMode] = useState<DegradedModeCause | null>(null);
  const [engineReady, setEngineReady] = useState(false);
  const [modelLoadProgress, setModelLoadProgress] = useState<ModelLoadProgress | null>(null);

  const [generationState, dispatchGeneration] = useReducer(reduceGeneration, {
    type: "idle",
  } as GenerationState);

  // Stable identity (deps: []) so it doesn't cause `inferenceEngine` below to
  // be re-created on every render -- `setModelLoadProgress` itself is stable
  // (React guarantee), so this closure never needs to change.
  const handleInitializationProgress = useCallback((report: InitializationProgressReport) => {
    setModelLoadProgress(parseModelLoadProgress(report));
  }, []);

  const inferenceEngine = useMemo(
    () => createInferenceEngine(handleInitializationProgress),
    [createInferenceEngine, handleInitializationProgress],
  );
  const conversationManager = useMemo(
    () => createConversationManager(),
    [createConversationManager],
  );
  // `modelDownloadManager`: `undefined` by default (WebLLM manages its own
  // download/caching, see note above). Injectable for tests or for a future
  // in-house download pipeline.
  const modelDownloadManager = modelDownloadManagerProp;

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

  const reloadConversations = useCallback(async () => {
    const list = await conversationManager.loadConversations();
    setConversations(list);
  }, [conversationManager]);

  const selectConversation = useCallback(
    (conversationId: string) => {
      conversationManager.selectConversation(conversationId);
      setActiveConversationId(conversationId);
    },
    [conversationManager],
  );

  const createConversation = useCallback(async () => {
    const conversation = await conversationManager.createConversation();
    setActiveConversationId(conversationManager.getActiveConversationId());
    await reloadConversations();
    return conversation;
  }, [conversationManager, reloadConversations]);

  const deleteConversation = useCallback(
    async (conversationId: string) => {
      await conversationManager.deleteConversation(conversationId);
      setActiveConversationId(conversationManager.getActiveConversationId());
      await reloadConversations();
    },
    [conversationManager, reloadConversations],
  );

  const importConversation = useCallback(
    async (conversation: Conversation) => {
      await conversationManager.importConversation(conversation);
      setActiveConversationId(conversationManager.getActiveConversationId());
      await reloadConversations();
    },
    [conversationManager, reloadConversations],
  );

  const addMessage = useCallback(
    async (conversationId: string, message: Message) => {
      await conversationManager.addMessage(conversationId, message);
      await reloadConversations();
    },
    [conversationManager, reloadConversations],
  );

  const activateDegradedMode = useCallback(
    (cause: DegradedModeCause) => {
      setDegradedMode(cause);
      showNotification({ type: "error", text: degradedModeMessage(cause) });
    },
    [showNotification],
  );

  useEffect(() => {
    const controller = new AbortController();

    async function runBootSequence(): Promise<void> {
      // 0. Diagnose how the PREVIOUS page session (if any) ended, before
      // this session's own markers can overwrite that signal (see
      // `sessionDiagnostics.ts`). Answers a question otherwise invisible on
      // a phone/tablet with no devtools: "did the browser process crash
      // mid-load/mid-generation, or did something reload the page
      // deliberately (`registerServiceWorker.ts`)?" Best-effort only --
      // never blocks or fails the boot sequence.
      //
      // `crashed_while_loading` additionally tracks a CONSECUTIVE-crash
      // counter (`recordLoadCrash()`): a phone was observed "loading, then
      // reloading" in a silent, invisible loop -- a hard process crash
      // during `inferenceEngine.initialize()` never runs any of this app's
      // `catch` blocks, so nothing was ever shown. One crash gets a quiet
      // retry (with a heads-up notification, in case it was transient);
      // `LOAD_CRASH_THRESHOLD` consecutive crashes stop the loop below
      // instead of retrying forever.
      const previousSessionSignal = takePreviousSessionSignal();
      let consecutiveLoadCrashes = 0;
      if (previousSessionSignal === "crashed_while_generating") {
        showNotification({ type: "error", text: PREVIOUS_SESSION_CRASHED_TEXT });
      } else if (previousSessionSignal === "crashed_while_loading") {
        consecutiveLoadCrashes = recordLoadCrash();
        if (consecutiveLoadCrashes < LOAD_CRASH_THRESHOLD) {
          showNotification({ type: "error", text: LOAD_INTERRUPTED_RETRY_TEXT });
        }
      }

      // 1. Compatibility detection (1.1, 1.2, 1.7).
      const probes = await detectFn();
      if (isCancelled(controller.signal)) {
        return;
      }
      const result = decideFn(probes);
      setCompatibility(result);

      // 1.3, 1.8, 10.6: no engine available (incompatibility or
      // insufficient memory) -> Degraded_Mode, without attempting download
      // or initialization.
      if (result.selectedEngine === "none") {
        activateDegradedMode(causeFromIncompatibility(result));
        setLoading(false);
        return;
      }

      // Give up auto-retrying after LOAD_CRASH_THRESHOLD consecutive
      // crashes while loading (see step 0 above): surface a clear,
      // actionable screen with a manual retry (App.tsx) instead of
      // attempting `initialize()` again and risking yet another silent
      // crash-and-reload.
      if (consecutiveLoadCrashes >= LOAD_CRASH_THRESHOLD) {
        activateDegradedMode({ type: "repeated_load_crash", attempts: consecutiveLoadCrashes });
        setLoading(false);
        return;
      }

      // 2. Ensuring the model is available (2.1, 2.5) via our own
      // ModelDownloadManager, ONLY if explicitly injected (by default there
      // isn't one: WebLLM downloads/caches its own weights in step 3).
      if (modelDownloadManager !== undefined) {
        try {
          await modelDownloadManager.ensureModelAvailable(() => {
            // Incremental download progress (2.2) is wired to the UI in a
            // later task; here we only guarantee the promise is awaited
            // before initializing.
          });
        } catch (error) {
          if (isCancelled(controller.signal)) {
            return;
          }
          // Logged locally only (never transmitted, see Requirement 6) so
          // the real cause is diagnosable instead of only surfacing the
          // generic degraded-mode message. `error.cause` is only the coarse
          // classification (e.g. "aborted"); the actually wrapped exception
          // lives in `originalCause` and is logged separately so it's
          // visible without manually expanding the error object.
          console.error("[AppState] Model download failed:", error);
          if (error instanceof ModelDownloadError) {
            console.error("[AppState] Underlying cause:", error.originalCause);
          }
          if (!isBrowserOnline()) {
            activateDegradedMode({ type: "no_connection_initial_load" });
            setLoading(false);
            return;
          }
          const downloadError = error as { message: string };
          showNotification({ type: "error", text: downloadError.message });
          activateDegradedMode({ type: "model_download_failure" });
          setLoading(false);
          return;
        }
      }
      if (isCancelled(controller.signal)) {
        return;
      }

      // 3. Inference_Engine initialization (4.1, 8.1, 8.5). WebLLM
      // downloads and internally caches the weight shards for the resolved
      // model id the first time it's called here (2.1, 2.3, 2.5). The model
      // id depends on `result.modelTier` (Requirement 1: a full-size model
      // reliably OOM-crashes memory-constrained devices such as phones, see
      // `configuration.ts`).
      //
      // Wrapped with markLoadingStarted()/markLoadingFinished() (outer
      // try/finally around the existing try/catch, same pattern as
      // `useSendMessage.ts`'s runGeneration()) so a hard crash here --
      // which skips the `catch` below entirely -- still leaves a marker
      // `sessionDiagnostics.ts` can read on the NEXT boot (step 0 above).
      markLoadingStarted();
      try {
        try {
          await inferenceEngine.initialize(
            result.selectedEngine,
            modelIdForTier(result.modelTier, result.shaderF16Available),
            contextWindowSizeForTier(result.modelTier),
          );
        } catch (error) {
          if (isCancelled(controller.signal)) {
            return;
          }
          // Logged locally only (never transmitted, see Requirement 6) so the
          // real cause is diagnosable instead of only surfacing the generic
          // degraded-mode message. `error.cause` is only the coarse
          // classification (e.g. "other_cause"); the actually wrapped
          // exception lives in `originalCause` and is logged separately so
          // it's visible without manually expanding the error object.
          console.error("[AppState] Inference engine initialization failed:", error);
          if (error instanceof EngineInitializationError) {
            console.error("[AppState] Underlying cause:", error.originalCause);
          }
          const classifiedCause: EngineInitializationFailureCause =
            error instanceof EngineInitializationError ? error.cause : "other_cause";
          // 3.5: if the browser is offline, report the specific
          // connection-required message instead of the generic
          // initialization-failure one -- but ONLY when the classification
          // itself is consistent with a download/unknown failure
          // (`network_error`/`other_cause`). A device-capability cause
          // (insufficient memory, an unsupported GPU feature/limit, WebGPU
          // gone unavailable) is real and worth surfacing on its own even if
          // the device also happens to be offline right now; reporting
          // "necesitás conexión" in that case would be actively misleading
          // (see the bug this was found from: a device whose real problem was
          // its GPU driver, not connectivity).
          if (!isBrowserOnline() && (classifiedCause === "network_error" || classifiedCause === "other_cause")) {
            activateDegradedMode({ type: "no_connection_initial_load" });
            setLoading(false);
            return;
          }
          const detail = describeErrorDetail(
            error instanceof EngineInitializationError ? error.originalCause : error,
          );
          activateDegradedMode({ type: "engine_init_failure", cause: classifiedCause, detail });
          setLoading(false);
          return;
        }
        if (isCancelled(controller.signal)) {
          return;
        }

        resetLoadCrashCount();
        setEngineReady(true);
        setLoading(false);
      } finally {
        markLoadingFinished();
      }

      // 4. Initial conversation load (5.3), once the engine is ready
      // (doesn't block Degraded_Mode activation if it fails). Loaded inline
      // (instead of calling the shared `reloadConversations` callback)
      // specifically so the cancellation check below can run between the
      // `await` and the state update: `reloadConversations` is also used by
      // unrelated user-triggered actions (createConversation,
      // deleteConversation, ...), which must NOT be tied to this effect's
      // AbortController. Without this check, a component unmount while
      // `loadConversations()` is still in flight would call `setConversations`
      // after unmount -- harmless in a real browser, but a hard crash
      // (`ReferenceError: window is not defined`) in the test environment,
      // since jsdom/happy-dom's `window` may already be torn down by then.
      const list = await conversationManager.loadConversations();
      if (isCancelled(controller.signal)) {
        return;
      }
      setConversations(list);
    }

    void runBootSequence();

    return () => {
      controller.abort();
    };
    // The boot sequence runs exactly once when the provider mounts; the
    // injectable dependencies (functions/instances) are memoized by whoever
    // provides them and must not re-trigger the boot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const contextValue = useMemo(
    () => ({
      compatibility,
      loading,
      degradedMode,
      engineReady,
      modelLoadProgress,
      generationState,
      dispatchGeneration,
      inferenceEngine,
      conversationManager,
      conversations,
      reloadConversations,
      activeConversationId,
      selectConversation,
      createConversation,
      deleteConversation,
      importConversation,
      addMessage,
    }),
    [
      compatibility,
      loading,
      degradedMode,
      engineReady,
      modelLoadProgress,
      generationState,
      inferenceEngine,
      conversationManager,
      conversations,
      reloadConversations,
      activeConversationId,
      selectConversation,
      createConversation,
      deleteConversation,
      importConversation,
      addMessage,
    ],
  );

  return <AppStateContext.Provider value={contextValue}>{children}</AppStateContext.Provider>;
}
