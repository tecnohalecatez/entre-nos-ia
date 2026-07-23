// Wrapper of the InferenceEngine over WebLLM's `MLCEngine`.
// See .kiro/specs/asistente-ia-local/design.md (section "Motor_Inferencia" and
// "Decisión tecnológica: motor de inferencia") for design detail.
//
// This interface isolates the rest of the system from the concrete WebLLM
// SDK, allowing it to be replaced and, above all, fully mocked in tests
// (task 5.4). To that end, the dependency toward the real WebLLM engine is
// injected via a factory function (`MlcEngineFactory`) instead of being
// constructed directly inside the class.

import type { CreateMLCEngine as CreateMLCEngineType } from "@mlc-ai/web-llm";
import type { Message, MessageRole } from "../types/models";

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
export type EngineInitializationFailureCause = "insufficient_memory" | "other_cause";

/**
 * Typed error thrown by `initialize()` when engine loading fails, allowing
 * the caller to distinguish between insufficient memory (8.1) and any other
 * cause (8.5) without freely inspecting error messages.
 */
export class EngineInitializationError extends Error {
  override readonly cause: EngineInitializationFailureCause;
  readonly originalCause: unknown;

  constructor(cause: EngineInitializationFailureCause, originalCause: unknown) {
    super(
      cause === "insufficient_memory"
        ? "Could not initialize the InferenceEngine: insufficient memory."
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

function extractErrorDescription(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name} ${error.message}`;
  }
  return String(error);
}

/**
 * Classifies an engine initialization error as insufficient memory (8.1) or
 * another cause (8.5).
 *
 * `MLCEngine.reload()` throws a `DeviceLostError` (name `"DeviceLostError"`)
 * when the WebGPU device is lost, which, per WebLLM's own documentation,
 * happens "mostly due to OOM"; it's detected by name because that class is
 * internal to the SDK and not part of its exported public API. For any
 * other error (including WASM failures without WebGPU), the message is
 * inspected for common out-of-memory patterns.
 */
export function classifyInitializationError(error: unknown): EngineInitializationFailureCause {
  if (error instanceof Error && error.name === "DeviceLostError") {
    return "insufficient_memory";
  }
  const description = extractErrorDescription(error);
  const isOOM = OOM_MESSAGE_PATTERNS.some((pattern) => pattern.test(description));
  return isOOM ? "insufficient_memory" : "other_cause";
}

function mapRoleToOpenAi(role: MessageRole): "user" | "assistant" {
  return role === "user" ? "user" : "assistant";
}

function mapHistoryToOpenAi(history: Message[]): OpenAiMessage[] {
  return history.map((message) => ({
    role: mapRoleToOpenAi(message.role),
    content: message.content,
  }));
}

/** Own InferenceEngine interface (see design.md, "Motor_Inferencia" section). */
export interface InferenceEngine {
  initialize(engine: "webgpu" | "wasm"): Promise<void>;
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
  private readonly modelId: string;
  private readonly engineFactory: MlcEngineFactory;
  private readonly onInitializationProgress: ((report: InitializationProgressReport) => void) | undefined;

  constructor(
    modelId: string,
    engineFactory: MlcEngineFactory,
    onInitializationProgress?: (report: InitializationProgressReport) => void,
  ) {
    this.modelId = modelId;
    this.engineFactory = engineFactory;
    this.onInitializationProgress = onInitializationProgress;
  }

  async initialize(engine: "webgpu" | "wasm"): Promise<void> {
    const options: MlcEngineFactoryOptions =
      this.onInitializationProgress !== undefined
        ? { onProgress: this.onInitializationProgress }
        : {};
    try {
      this.mlcEngine = await this.engineFactory(this.modelId, engine, options);
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
    const realEngine =
      options?.onProgress !== undefined
        ? await createMLCEngine(modelId, { initProgressCallback: options.onProgress })
        : await createMLCEngine(modelId);
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
