// Wrapper of the InferenceEngine over WebLLM's `MLCEngine`.
// See .kiro/specs/asistente-ia-local/design.md (section "Motor_Inferencia" and
// "Decisión tecnológica: motor de inferencia") for design detail.
//
// This interface isolates the rest of the system from the concrete WebLLM
// SDK, allowing it to be replaced and, above all, fully mocked in tests
// (task 5.4). To that end, the dependency toward the real WebLLM engine is
// injected via a factory function (`MlcEngineFactory`) instead of being
// constructed directly inside the class.

import type { ChatOptions, CreateMLCEngine as CreateMLCEngineType } from "@mlc-ai/web-llm";
import type { Message, MessageRole } from "../types/models";
import { SYSTEM_PROMPT } from "./systemPrompt";

/**
 * Best-effort mitigation for "degenerate repetition" -- the model regenerates
 * an entire block of text (e.g. a whole markdown list) verbatim a second
 * time within the same response. Observed with `Llama-3.2-1B` generating
 * long lists (not observed with the previous 3B model): small instruct
 * models are more prone to looping back to an already-visited high-probability
 * state without a repetition penalty. Not a measured tuning value -- 1.15 is
 * the typical value recommended for MLC/llama.cpp-style engines to break
 * loops without noticeably hurting fluency.
 */
const REPETITION_PENALTY = 1.15;

/**
 * Safety net: if `REPETITION_PENALTY` doesn't fully prevent a loop, this
 * bounds the worst-case damage instead of generating until the
 * `context_window_size` is exhausted -- most relevant on the "compact" tier,
 * whose context window (`CONTEXT_WINDOW_SIZE_COMPACT`, `configuration.ts`)
 * is only 2048 tokens.
 */
const MAX_TOKENS = 1024;

/** Message in the role/content format expected by WebLLM's chat API (OpenAI-compatible). */
export type OpenAiMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string };

/** Fragment of a streamed response, with the same shape as WebLLM's `ChatCompletionChunk`. */
export interface MlcResponseChunk {
  choices: { delta: { content?: string | null } }[];
}

/**
 * Minimal surface of `MLCEngine` that `InferenceEngineWebLLM` needs.
 * A dedicated type is defined (instead of using `MLCEngine` directly) so
 * that task 5.4 can replace it with a trivial stub in tests, without
 * depending on WebGPU, model weights, or the real SDK.
 */
export interface MlcEngine {
  chat: {
    completions: {
      create(request: {
        messages: OpenAiMessage[];
        stream: true;
        repetition_penalty?: number;
        max_tokens?: number;
      }): Promise<AsyncIterable<MlcResponseChunk>>;
    };
  };
  interruptGenerate(): Promise<void> | void;
}

/** Progress reported during engine initialization/loading (see WebLLM's `InitProgressReport`). */
export interface InitializationProgressReport {
  progress: number;
  timeElapsed: number;
  text: string;
}

export interface MlcEngineFactoryOptions {
  onProgress?: (report: InitializationProgressReport) => void;
  /**
   * Overrides for the model's own `mlc-chat-config.json` (e.g.
   * `context_window_size`). Used to reduce the KV-cache's memory footprint
   * during generation on memory-constrained devices -- see
   * `configuration.ts`, `contextWindowSizeForTier()`.
   */
  chatOptions?: ChatOptions;
}

/**
 * Factory function that builds and initializes an `MlcEngine` for the given
 * `modelId` and inference mechanism (`engine`). It's injected into
 * `InferenceEngineWebLLM`'s constructor, which allows it to be replaced by
 * a test double.
 */
export type MlcEngineFactory = (
  modelId: string,
  engine: "webgpu" | "wasm",
  options?: MlcEngineFactoryOptions,
) => Promise<MlcEngine>;

/** Cause of an InferenceEngine initialization failure (Requisitos 8.1, 8.5). */
export type EngineInitializationFailureCause =
  | "insufficient_memory"
  | "network_error"
  | "unsupported_gpu_feature"
  | "gpu_unavailable"
  | "other_cause";

/**
 * Typed error thrown by `initialize()` when engine loading fails, allowing
 * the caller to distinguish between insufficient memory (8.1), a network
 * failure while fetching the model, an unsupported required GPU feature, an
 * inconsistent WebGPU availability, and any other cause (8.5) without
 * freely inspecting error messages.
 */
export class EngineInitializationError extends Error {
  override readonly cause: EngineInitializationFailureCause;
  readonly originalCause: unknown;

  constructor(cause: EngineInitializationFailureCause, originalCause: unknown) {
    super(
      cause === "insufficient_memory"
        ? "Could not initialize the InferenceEngine: insufficient memory."
        : cause === "network_error"
          ? "Could not initialize the InferenceEngine: network error while fetching the model."
          : cause === "unsupported_gpu_feature"
            ? "Could not initialize the InferenceEngine: a required GPU feature is not supported."
            : cause === "gpu_unavailable"
              ? "Could not initialize the InferenceEngine: WebGPU was unavailable when the engine tried to use it."
              : "Could not initialize the InferenceEngine."
    );
    this.name = "EngineInitializationError";
    this.cause = cause;
    this.originalCause = originalCause;
  }
}

const OOM_MESSAGE_PATTERNS: readonly RegExp[] = [
  /out[ -]?of[ -]?memory/i,
  /\boom\b/i,
  /memoria insuficiente/i,
  /allocation failed/i,
  /array buffer allocation failed/i,
  /device was lost/i,
];

/**
 * Patterns matching a failed network/model-download request, e.g. the
 * browser blocking the request (content blockers, strict privacy modes
 * like Brave Shields), CORS issues, or plain connectivity problems.
 */
const NETWORK_ERROR_PATTERNS: readonly RegExp[] = [
  /failed to fetch/i,
  /network\s*error/i,
  /err_blocked_by_client/i,
  /err_connection/i,
  /err_internet_disconnected/i,
  /err_name_not_resolved/i,
  /load failed/i,
  /\bcors\b/i,
];

function extractErrorDescription(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name} ${error.message}`;
  }
  return String(error);
}

/**
 * Classifies an engine initialization error as insufficient memory (8.1), a
 * network/download failure, an unsupported required GPU feature, an
 * inconsistent WebGPU availability, or another cause (8.5).
 *
 * `MLCEngine.reload()` throws a `DeviceLostError` (name `"DeviceLostError"`)
 * when the WebGPU device is lost, which, per WebLLM's own documentation,
 * happens "mostly due to OOM"; it's detected by name because that class is
 * internal to the SDK and not part of its exported public API.
 *
 * `ShaderF16SupportError`/`FeatureSupportError` (also detected by name, same
 * reason) are WebLLM's error for a model whose `required_features` the
 * adapter doesn't support -- in practice, always `shader-f16` today (the
 * only feature required anywhere in WebLLM's prebuilt catalog). This is a
 * defense-in-depth classification: `configuration.ts`'s `modelIdForTier()`
 * proactively picks a `q4f32_1` model when `shaderF16Available` is false
 * specifically to avoid this error; it should only surface if that
 * proactive check itself is ever wrong (e.g. a future catalog model
 * requiring a different, unprobed feature).
 *
 * `WebGPUNotAvailableError`/`WebGPUNotFoundError` (also detected by name)
 * come from `MLCEngine.reload()`'s own internal `detectGPUDevice()` call --
 * a SEPARATE `requestAdapter()`/`requestDevice()` negotiation, independent
 * of the one `detect.ts`'s `probeWebgpu()` already performed. If our probe
 * reported `webgpuAvailable: true` but this internal one fails anyway (e.g.
 * a flaky low-end Android GPU driver, or GPU context lost between the two
 * probes), it surfaces here as `"gpu_unavailable"` instead of the generic
 * `"other_cause"` -- diagnostic visibility for a real-world failure mode
 * observed on-device that doesn't match any of the classifications above.
 *
 * For any other error (including WASM failures without WebGPU), the message
 * is inspected first for common out-of-memory patterns, then for common
 * network-failure patterns (the model's weight shards are fetched from a
 * third-party CDN, so this is a frequent real-world failure mode -- e.g. a
 * content blocker or privacy-focused browser mode blocking the request).
 */
export function classifyInitializationError(error: unknown): EngineInitializationFailureCause {
  if (error instanceof Error && error.name === "DeviceLostError") {
    return "insufficient_memory";
  }
  if (error instanceof Error && (error.name === "ShaderF16SupportError" || error.name === "FeatureSupportError")) {
    return "unsupported_gpu_feature";
  }
  if (error instanceof Error && (error.name === "WebGPUNotAvailableError" || error.name === "WebGPUNotFoundError")) {
    return "gpu_unavailable";
  }
  const description = extractErrorDescription(error);
  if (OOM_MESSAGE_PATTERNS.some((pattern) => pattern.test(description))) {
    return "insufficient_memory";
  }
  if (NETWORK_ERROR_PATTERNS.some((pattern) => pattern.test(description))) {
    return "network_error";
  }
  return "other_cause";
}

function mapRoleToOpenAi(role: MessageRole): "user" | "assistant" {
  return role === "user" ? "user" : "assistant";
}

// The system message is injected here, in the mapping layer, and never
// stored as part of a Conversation's history: `MessageRole`
// (`../types/models.ts`) is `"user" | "assistant"` and cannot represent
// `"system"`. This keeps it out of IndexedDB persistence and export/import
// (Requisito 7), and means changing it applies retroactively to every
// existing Conversation without a migration. It's prefixed exactly once per
// request, as expected by Llama-3's chat template.
function mapHistoryToOpenAi(history: Message[]): OpenAiMessage[] {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.map((message) => ({
      role: mapRoleToOpenAi(message.role),
      content: message.content,
    })),
  ];
}

/** Own InferenceEngine interface (see design.md, "Motor_Inferencia" section). */
export interface InferenceEngine {
  /**
   * `modelId` is passed here rather than fixed at construction time because
   * it depends on `decide()`'s `modelTier` (`configuration.ts`,
   * `modelIdForTier`), only known once the boot sequence's compatibility
   * detection has run -- after the `InferenceEngine` instance already
   * exists (see `AppStateProvider.tsx`).
   *
   * `contextWindowSize`, when provided, overrides the model's own default
   * (see `configuration.ts`, `contextWindowSizeForTier()`): used to shrink
   * the KV-cache's memory footprint during generation on memory-constrained
   * devices. `undefined` keeps the model's own default unchanged.
   */
  initialize(engine: "webgpu" | "wasm", modelId: string, contextWindowSize?: number): Promise<void>;
  generate(history: Message[]): AsyncIterable<string>;
  cancel(): void;
}

/**
 * Implementation of `InferenceEngine` over WebLLM's `MLCEngine`.
 *
 * The dependency toward the real SDK is received via `engineFactory`, which
 * defaults to `CreateMLCEngine` from `@mlc-ai/web-llm` (see
 * `createDefaultMlcEngineFactory`). This allows task 5.4 to inject a test
 * double instead.
 */
export class InferenceEngineWebLLM implements InferenceEngine {
  private mlcEngine: MlcEngine | null = null;
  private readonly engineFactory: MlcEngineFactory;
  private readonly onInitializationProgress: ((report: InitializationProgressReport) => void) | undefined;

  constructor(
    engineFactory: MlcEngineFactory,
    onInitializationProgress?: (report: InitializationProgressReport) => void,
  ) {
    this.engineFactory = engineFactory;
    this.onInitializationProgress = onInitializationProgress;
  }

  async initialize(engine: "webgpu" | "wasm", modelId: string, contextWindowSize?: number): Promise<void> {
    const options: MlcEngineFactoryOptions = {
      ...(this.onInitializationProgress !== undefined ? { onProgress: this.onInitializationProgress } : {}),
      ...(contextWindowSize !== undefined ? { chatOptions: { context_window_size: contextWindowSize } } : {}),
    };
    try {
      this.mlcEngine = await this.engineFactory(modelId, engine, options);
    } catch (error) {
      throw new EngineInitializationError(classifyInitializationError(error), error);
    }
  }

  generate(history: Message[]): AsyncIterable<string> {
    const { mlcEngine } = this;
    if (mlcEngine === null) {
      throw new Error("InferenceEngine.generate() was invoked before initialize() or after an initialization failure.");
    }

    return (async function* generateChunks(): AsyncIterable<string> {
      const chunks = await mlcEngine.chat.completions.create({
        messages: mapHistoryToOpenAi(history),
        stream: true,
        repetition_penalty: REPETITION_PENALTY,
        max_tokens: MAX_TOKENS,
      });
      for await (const chunk of chunks) {
        const text = chunk.choices[0]?.delta.content;
        if (text !== undefined && text !== null && text.length > 0) {
          yield text;
        }
      }
    })();
  }

  cancel(): void {
    if (this.mlcEngine === null) {
      return;
    }
    const result = this.mlcEngine.interruptGenerate();
    if (result instanceof Promise) {
      result.catch(() => {
        // Cancellation is best-effort: a failure here must not propagate
        // as an unhandled exception.
      });
    }
  }
}

/**
 * Default factory of `MlcEngine`, backed by `CreateMLCEngine` from
 * `@mlc-ai/web-llm`.
 *
 * @note WebLLM does not currently expose an explicit parameter to force a
 * pure "wasm" backend independent of WebGPU: the inference mechanism
 * (`engine`) decided by the Detector_Compatibilidad is received here and
 * remains available to adapt the engine configuration (e.g. model or
 * `appConfig` selection) as WebLLM expands that support, without having to
 * modify the `InferenceEngine` interface.
 */
export function createDefaultMlcEngineFactory(
  createMLCEngine: typeof CreateMLCEngineType,
): MlcEngineFactory {
  return async (modelId, _engine, options) => {
    const engineConfig = options?.onProgress !== undefined ? { initProgressCallback: options.onProgress } : {};
    const realEngine = await createMLCEngine(modelId, engineConfig, options?.chatOptions);
    return {
      chat: {
        completions: {
          create: (request) => realEngine.chat.completions.create(request),
        },
      },
      interruptGenerate: () => realEngine.interruptGenerate(),
    };
  };
}
