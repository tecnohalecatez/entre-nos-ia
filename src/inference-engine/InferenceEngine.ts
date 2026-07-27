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
import { truncateHistory } from "./truncateHistory";

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
 * Upper bound on `max_tokens`, used together with `contextWindowSize` (see
 * `maxTokensForContextWindow()`) instead of a single fixed value: a fixed
 * 1024 was, on the "compact" tier's 2048-token window
 * (`CONTEXT_WINDOW_SIZE_COMPACT`, `configuration.ts`), already HALF the
 * entire window before a single token of history or system prompt is
 * counted. Scaling it down on smaller windows leaves realistic room for the
 * prompt itself, while still capping the worst case instead of generating
 * until the window is exhausted.
 */
const MAX_TOKENS_CEILING = 1024;

/**
 * Local mirror of `configuration.ts`'s `CONTEXT_WINDOW_SIZE_DEFAULT`.
 * Duplicated (not imported) on purpose: `inference-engine/` is a lower-level
 * module that `app-state/configuration.ts` depends on (it decides the model
 * id/tier and hands `InferenceEngine.initialize()` a resolved
 * `contextWindowSize` override); importing back from here would invert that
 * direction. Used only as the fallback for the `max_tokens`/truncation
 * budget below when `initialize()` was called with `contextWindowSize ===
 * undefined` (the "full" tier keeps the model's own default unchanged, see
 * `contextWindowSizeForTier()`) -- every Llama-3.2 catalog entry's own
 * default is 4096, so this mirrors a real, currently-true fact about the
 * loaded model rather than an arbitrary guess.
 */
const DEFAULT_CONTEXT_WINDOW_SIZE = 4096;

/** Derives the per-request `max_tokens` cap from the model's actual context window. */
function maxTokensForContextWindow(contextWindowSize: number): number {
  return Math.min(MAX_TOKENS_CEILING, Math.floor(contextWindowSize / 4));
}

/**
 * Rough, deliberately conservative chars-per-token estimate for Llama-3's
 * tokenizer on Spanish text, used only to size the history-truncation
 * budget below -- there is no tokenizer available at this layer (running
 * the real one would mean loading another WASM module just to count).
 */
const CHARS_PER_TOKEN_ESTIMATE = 3;

/**
 * Character budget for the history passed to `truncateHistory()`: the
 * context window minus what's reserved for the model's own output
 * (`maxTokens`) and for `SYSTEM_PROMPT` (always prefixed, see
 * `mapHistoryToOpenAi`), converted to characters via
 * `CHARS_PER_TOKEN_ESTIMATE`.
 */
function estimateHistoryCharBudget(contextWindowSize: number, maxTokens: number): number {
  const reservedTokens = maxTokens + Math.ceil(SYSTEM_PROMPT.length / CHARS_PER_TOKEN_ESTIMATE);
  const budgetTokens = Math.max(contextWindowSize - reservedTokens, 0);
  return budgetTokens * CHARS_PER_TOKEN_ESTIMATE;
}

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
  | "unsupported_gpu_limits"
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
            : cause === "unsupported_gpu_limits"
              ? "Could not initialize the InferenceEngine: the GPU/driver's WebGPU limits are below what the engine requires."
              : cause === "gpu_unavailable"
                ? "Could not initialize the InferenceEngine: WebGPU was unavailable when the engine tried to use it."
                : "Could not initialize the InferenceEngine."
    );
    this.name = "EngineInitializationError";
    this.cause = cause;
    this.originalCause = originalCause;
  }
}

/**
 * Patterns matching WebLLM's `detectGPUDevice()` throwing because the
 * adapter's WebGPU limits (`maxBufferSize`, `maxStorageBufferBindingSize`,
 * `maxComputeWorkgroupStorageSize`, `maxStorageBuffersPerShaderStage`) fall
 * below what the engine requests -- a real failure mode on lower-end mobile
 * GPU drivers (Mali, Adreno, common on budget/mid Android tablets) that
 * report `webgpuAvailable: true` in `detect.ts`'s probe (a real adapter IS
 * obtained there) but can't actually satisfy WebLLM's own, separate
 * `requestDevice()` call. These come as plain `Error` objects (not one of
 * WebLLM's named/exported error classes), so detection here is
 * message-based, same as `OOM_MESSAGE_PATTERNS`/`NETWORK_ERROR_PATTERNS`
 * below. See `node_modules/@mlc-ai/web-llm/lib/index.js`, `detectGPUDevice()`.
 */
const GPU_LIMIT_PATTERNS: readonly RegExp[] = [
  /exceeds limit/i,
  /maxStorageBuffer/i,
  /maxBufferSize/i,
  /maxComputeWorkgroup/i,
];

/**
 * `detectGPUDevice()`'s own "no adapter" message. Distinct from
 * `WebGPUNotAvailableError`/`WebGPUNotFoundError` above (named error
 * classes from elsewhere in the SDK): this one is a plain `Error` thrown
 * when `navigator.gpu.requestAdapter()` itself resolves to `null` inside
 * WebLLM's own call, same underlying cause (`gpu_unavailable`) as those.
 */
const GPU_NOT_FOUND_PATTERNS: readonly RegExp[] = [/unable to find a compatible gpu/i];

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
 * `GPU_LIMIT_PATTERNS`/`GPU_NOT_FOUND_PATTERNS` (message-based, same
 * `detectGPUDevice()` call as the paragraph above, but these come as plain,
 * unnamed `Error`s instead of the named classes): a real adapter was
 * obtained and DOES report `webgpuAvailable: true`, but its WebGPU limits
 * (`maxStorageBuffersPerShaderStage`, etc.) are below what WebLLM requires
 * -- `"unsupported_gpu_limits"`, a fixed capability of that device's
 * GPU/driver, not something a reload fixes -- or no adapter was found at
 * all inside this specific call, `"gpu_unavailable"`.
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
  if (GPU_LIMIT_PATTERNS.some((pattern) => pattern.test(description))) {
    return "unsupported_gpu_limits";
  }
  if (GPU_NOT_FOUND_PATTERNS.some((pattern) => pattern.test(description))) {
    return "gpu_unavailable";
  }
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
  /**
   * The `contextWindowSize` `initialize()` was called with, kept only to
   * size `generate()`'s `max_tokens`/history-truncation budget --
   * `undefined` when the "full" tier left the model's own default (4096)
   * unchanged, see `DEFAULT_CONTEXT_WINDOW_SIZE` above.
   */
  private contextWindowSize: number | undefined;

  constructor(
    engineFactory: MlcEngineFactory,
    onInitializationProgress?: (report: InitializationProgressReport) => void,
  ) {
    this.engineFactory = engineFactory;
    this.onInitializationProgress = onInitializationProgress;
  }

  async initialize(engine: "webgpu" | "wasm", modelId: string, contextWindowSize?: number): Promise<void> {
    this.contextWindowSize = contextWindowSize;
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

    const contextWindowSize = this.contextWindowSize ?? DEFAULT_CONTEXT_WINDOW_SIZE;
    const maxTokens = maxTokensForContextWindow(contextWindowSize);
    // Bounds the prompt itself against the same context window (Requirement
    // 1): without this, a long Conversation is resent in full on every turn
    // (`useSendMessage.ts` never truncates), silently outgrowing the KV
    // cache -- the exact OOM vector `contextWindowSizeForTier()` already
    // shrinks the window to guard against on memory-constrained devices.
    const truncatedHistory = truncateHistory(history, estimateHistoryCharBudget(contextWindowSize, maxTokens));

    return (async function* generateChunks(): AsyncIterable<string> {
      const chunks = await mlcEngine.chat.completions.create({
        messages: mapHistoryToOpenAi(truncatedHistory),
        stream: true,
        repetition_penalty: REPETITION_PENALTY,
        max_tokens: maxTokens,
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
