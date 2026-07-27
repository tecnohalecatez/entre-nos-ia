// Unit (example-based/simulation) tests for the `InferenceEngineWebLLM` wrapper.
// `MlcEngine` (the minimal surface the wrapper needs from `MLCEngine`) is
// simulated via a test `MlcEngineFactory`, avoiding dependence on WebGPU,
// model weights or the real WebLLM SDK.

import { describe, expect, it, vi } from "vitest";
import type { Message } from "../types/models";
import {
  EngineInitializationError,
  InferenceEngineWebLLM,
  classifyInitializationError,
  type MlcEngineFactory,
  type MlcResponseChunk,
  type MlcEngine,
} from "./InferenceEngine";
import { SYSTEM_PROMPT } from "./systemPrompt";

function createMessage(role: Message["role"], content: string, timestamp = 1_000): Message {
  return { id: `${role}-${String(timestamp)}`, role, content, timestamp };
}

/** Builds a simulated `MlcEngine` whose `chat.completions.create` produces the given chunks. */
function createFakeMlcEngine(chunks: MlcResponseChunk[]): {
  engine: MlcEngine;
  create: ReturnType<typeof vi.fn>;
  interruptGenerate: ReturnType<typeof vi.fn>;
} {
  const create = vi.fn(function* (): Iterable<MlcResponseChunk> {
    for (const chunk of chunks) {
      yield chunk;
    }
  });
  const interruptGenerate = vi.fn();
  const engine: MlcEngine = {
    chat: { completions: { create: create as unknown as MlcEngine["chat"]["completions"]["create"] } },
    interruptGenerate,
  };
  return { engine, create, interruptGenerate };
}

describe("InferenceEngineWebLLM.initialize", () => {
  it("resolves without throwing when the engine factory initializes successfully", async () => {
    const { engine } = createFakeMlcEngine([]);
    const engineFactory: MlcEngineFactory = vi.fn().mockResolvedValue(engine);
    const inferenceEngine = new InferenceEngineWebLLM(engineFactory);

    await expect(inferenceEngine.initialize("webgpu", "test-model")).resolves.toBeUndefined();
    expect(engineFactory).toHaveBeenCalledWith("test-model", "webgpu", {});
  });

  it("passes contextWindowSize through to the engine factory as chatOptions.context_window_size (Requirement 1: reduce KV-cache memory on mobile)", async () => {
    const { engine } = createFakeMlcEngine([]);
    const engineFactory: MlcEngineFactory = vi.fn().mockResolvedValue(engine);
    const inferenceEngine = new InferenceEngineWebLLM(engineFactory);

    await inferenceEngine.initialize("webgpu", "test-model", 2048);

    expect(engineFactory).toHaveBeenCalledWith("test-model", "webgpu", {
      chatOptions: { context_window_size: 2048 },
    });
  });

  it("does NOT include chatOptions when contextWindowSize is omitted (full tier: keep the model's own default)", async () => {
    const { engine } = createFakeMlcEngine([]);
    const engineFactory: MlcEngineFactory = vi.fn().mockResolvedValue(engine);
    const inferenceEngine = new InferenceEngineWebLLM(engineFactory);

    await inferenceEngine.initialize("webgpu", "test-model");

    expect(engineFactory).toHaveBeenCalledWith("test-model", "webgpu", {});
  });

  it("rejects with EngineInitializationError(cause='insufficient_memory') on a DeviceLostError (Requisito 8.1)", async () => {
    const originalError = new Error("device lost");
    originalError.name = "DeviceLostError";
    const engineFactory: MlcEngineFactory = vi.fn().mockRejectedValue(originalError);
    const inferenceEngine = new InferenceEngineWebLLM(engineFactory);

    await expect(inferenceEngine.initialize("webgpu", "test-model")).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(EngineInitializationError);
      expect((error as EngineInitializationError).cause).toBe("insufficient_memory");
      expect((error as EngineInitializationError).originalCause).toBe(originalError);
      return true;
    });
  });

  it("rejects with EngineInitializationError(cause='insufficient_memory') on an out of memory message (Requisito 8.1)", async () => {
    const originalError = new Error("Out of memory while allocating buffer");
    const engineFactory: MlcEngineFactory = vi.fn().mockRejectedValue(originalError);
    const inferenceEngine = new InferenceEngineWebLLM(engineFactory);

    await expect(inferenceEngine.initialize("wasm", "test-model")).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(EngineInitializationError);
      expect((error as EngineInitializationError).cause).toBe("insufficient_memory");
      return true;
    });
  });

  it("rejects with EngineInitializationError(cause='network_error') on a fetch failure (Requisito 8.5)", async () => {
    const originalError = new Error("Failed to fetch");
    const engineFactory: MlcEngineFactory = vi.fn().mockRejectedValue(originalError);
    const inferenceEngine = new InferenceEngineWebLLM(engineFactory);

    await expect(inferenceEngine.initialize("webgpu", "test-model")).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(EngineInitializationError);
      expect((error as EngineInitializationError).cause).toBe("network_error");
      expect((error as EngineInitializationError).originalCause).toBe(originalError);
      return true;
    });
  });

  it("rejects with EngineInitializationError(cause='other_cause') on a generic unclassifiable error (Requisito 8.5)", async () => {
    const originalError = new Error("unexpected worker crash");
    const engineFactory: MlcEngineFactory = vi.fn().mockRejectedValue(originalError);
    const inferenceEngine = new InferenceEngineWebLLM(engineFactory);

    await expect(inferenceEngine.initialize("webgpu", "test-model")).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(EngineInitializationError);
      expect((error as EngineInitializationError).cause).toBe("other_cause");
      expect((error as EngineInitializationError).originalCause).toBe(originalError);
      return true;
    });
  });
});

describe("InferenceEngineWebLLM.generate", () => {
  it("propagates chunks incrementally and in order (Requisitos 4.1, 4.2)", async () => {
    const simulatedChunks: MlcResponseChunk[] = [
      { choices: [{ delta: { content: "Hola" } }] },
      { choices: [{ delta: {} }] },
      { choices: [{ delta: { content: ", " } }] },
      { choices: [{ delta: { content: null } }] },
      { choices: [{ delta: { content: "mundo" } }] },
    ];
    const { engine, create } = createFakeMlcEngine(simulatedChunks);
    const engineFactory: MlcEngineFactory = vi.fn().mockResolvedValue(engine);
    const inferenceEngine = new InferenceEngineWebLLM(engineFactory);
    await inferenceEngine.initialize("webgpu", "test-model");

    const history: Message[] = [createMessage("user", "hola")];
    const received: string[] = [];
    for await (const chunk of inferenceEngine.generate(history)) {
      // Each `push` occurs in a separate iteration of the `for await`, which
      // confirms that propagation is incremental (chunk by chunk) and not a
      // bulk delivery of an already-resolved array.
      received.push(chunk);
    }

    expect(received).toEqual(["Hola", ", ", "mundo"]);
    expect(create).toHaveBeenCalledWith({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: "hola" },
      ],
      stream: true,
      repetition_penalty: 1.15,
      max_tokens: 1024,
    });
  });

  it("prefixes the system prompt exactly once, even with a multi-turn history", async () => {
    const { engine, create } = createFakeMlcEngine([]);
    const engineFactory: MlcEngineFactory = vi.fn().mockResolvedValue(engine);
    const inferenceEngine = new InferenceEngineWebLLM(engineFactory);
    await inferenceEngine.initialize("webgpu", "test-model");

    const history: Message[] = [
      createMessage("user", "hola", 1),
      createMessage("assistant", "Hola, ¿en qué puedo ayudarte?", 2),
      createMessage("user", "que puedes hacer", 3),
    ];
    // Triggers `chat.completions.create()` without needing a bound loop
    // variable (the fake engine yields no chunks).
    await inferenceEngine.generate(history)[Symbol.asyncIterator]().next();

    const request = create.mock.calls[0]?.[0] as { messages: unknown[] };
    expect(request.messages).toHaveLength(4);
    expect(request.messages[0]).toEqual({ role: "system", content: SYSTEM_PROMPT });
  });

  it("reduces max_tokens on a smaller context window (compact tier) instead of the fixed 1024 ceiling", async () => {
    const { engine, create } = createFakeMlcEngine([]);
    const engineFactory: MlcEngineFactory = vi.fn().mockResolvedValue(engine);
    const inferenceEngine = new InferenceEngineWebLLM(engineFactory);
    await inferenceEngine.initialize("webgpu", "test-model", 2048);

    await inferenceEngine.generate([createMessage("user", "hola")])[Symbol.asyncIterator]().next();

    const request = create.mock.calls[0]?.[0] as { max_tokens: number };
    expect(request.max_tokens).toBe(512);
  });

  it("truncates old history that no longer fits the context window, while always keeping the most recent message (Requirement 1: bound the prompt against a small window)", async () => {
    const { engine, create } = createFakeMlcEngine([]);
    const engineFactory: MlcEngineFactory = vi.fn().mockResolvedValue(engine);
    const inferenceEngine = new InferenceEngineWebLLM(engineFactory);
    await inferenceEngine.initialize("webgpu", "test-model", 2048);

    // Far larger than the ~2048-token compact window could ever hold.
    const history: Message[] = Array.from({ length: 50 }, (_unused, index) =>
      createMessage(index % 2 === 0 ? "user" : "assistant", "X".repeat(200), index),
    );

    await inferenceEngine.generate(history)[Symbol.asyncIterator]().next();

    const request = create.mock.calls[0]?.[0] as { messages: { role: string; content: string }[] };
    expect(request.messages[0]).toEqual({ role: "system", content: SYSTEM_PROMPT });
    // Some truncation happened: not every one of the 50 messages fits.
    expect(request.messages.length).toBeLessThan(history.length + 1);
    // The most recent message is never dropped.
    const lastHistoryMessage = history[history.length - 1];
    expect(request.messages[request.messages.length - 1]).toEqual({
      role: "assistant",
      content: lastHistoryMessage?.content,
    });
  });

  it("throws if invoked before initialize() has successfully finished", () => {
    const engineFactory: MlcEngineFactory = vi.fn();
    const inferenceEngine = new InferenceEngineWebLLM(engineFactory);

    expect(() => inferenceEngine.generate([createMessage("user", "hola")])).toThrow();
  });

  it("throws if initialize() previously failed (mlcEngine remains null)", async () => {
    const engineFactory: MlcEngineFactory = vi.fn().mockRejectedValue(new Error("network error"));
    const inferenceEngine = new InferenceEngineWebLLM(engineFactory);

    await expect(inferenceEngine.initialize("webgpu", "test-model")).rejects.toBeInstanceOf(EngineInitializationError);
    expect(() => inferenceEngine.generate([createMessage("user", "hola")])).toThrow();
  });
});

describe("InferenceEngineWebLLM.cancel", () => {
  it("invokes the underlying engine's interruptGenerate() after a successful initialization", async () => {
    const { engine, interruptGenerate } = createFakeMlcEngine([]);
    const engineFactory: MlcEngineFactory = vi.fn().mockResolvedValue(engine);
    const inferenceEngine = new InferenceEngineWebLLM(engineFactory);
    await inferenceEngine.initialize("webgpu", "test-model");

    inferenceEngine.cancel();

    expect(interruptGenerate).toHaveBeenCalledTimes(1);
  });

  it("does not throw when called before initialize() (no-op)", () => {
    const engineFactory: MlcEngineFactory = vi.fn();
    const inferenceEngine = new InferenceEngineWebLLM(engineFactory);

    expect(() => {
      inferenceEngine.cancel();
    }).not.toThrow();
  });
});

describe("classifyInitializationError", () => {
  it("classifies an error with name='DeviceLostError' as insufficient_memory", () => {
    const error = new Error("perdida de dispositivo");
    error.name = "DeviceLostError";
    expect(classifyInitializationError(error)).toBe("insufficient_memory");
  });

  it.each([
    "Out of memory",
    "out-of-memory error",
    "OOM",
    "memoria insuficiente para cargar el modelo",
    "Allocation failed",
    "Array buffer allocation failed",
    "The device was lost",
  ])("classifies the message %j as insufficient_memory", (message) => {
    expect(classifyInitializationError(new Error(message))).toBe("insufficient_memory");
  });

  it.each([
    "Failed to fetch",
    "NetworkError when attempting to fetch resource",
    "net::ERR_BLOCKED_BY_CLIENT",
    "net::ERR_CONNECTION_RESET",
    "net::ERR_INTERNET_DISCONNECTED",
  ])("classifies the message %j as network_error", (message) => {
    expect(classifyInitializationError(new Error(message))).toBe("network_error");
  });

  it.each(["ShaderF16SupportError", "FeatureSupportError"])(
    "classifies an error with name='%s' as unsupported_gpu_feature (Requirement 1: WebLLM's models all require shader-f16, unsupported by some Android GPU drivers)",
    (name) => {
      const error = new Error(
        "This model requires WebGPU extension shader-f16, which is not enabled in this browser.",
      );
      error.name = name;
      expect(classifyInitializationError(error)).toBe("unsupported_gpu_feature");
    },
  );

  it.each(["WebGPUNotAvailableError", "WebGPUNotFoundError"])(
    "classifies an error with name='%s' as gpu_unavailable (Requirement 1: WebLLM's own internal detectGPUDevice() call failing independently of our probe)",
    (name) => {
      const error = new Error("WebGPU is not supported in your current environment.");
      error.name = name;
      expect(classifyInitializationError(error)).toBe("gpu_unavailable");
    },
  );

  it.each([
    "Cannot initialize runtime because of requested maxStorageBuffersPerShaderStage exceeds limit. requested=10, limit=8. ",
    "Cannot initialize runtime because of requested maxBufferSize exceeds limit. requested=1024MB, limit=256MB.",
    "Cannot initialize runtime because of requested maxStorageBufferBindingSize exceeds limit. requested=1024MB, limit=128MB. ",
    "Cannot initialize runtime because of requested maxComputeWorkgroupStorageSize exceeds limit. requested=32768, limit=16384. ",
  ])(
    "classifies the message %j as unsupported_gpu_limits (Requirement 1: WebLLM's detectGPUDevice() throwing a plain Error when the adapter's WebGPU limits are below what it requests, common on Mali/Adreno mobile drivers)",
    (message) => {
      expect(classifyInitializationError(new Error(message))).toBe("unsupported_gpu_limits");
    },
  );

  it("classifies WebLLM's own 'Unable to find a compatible GPU' plain Error as gpu_unavailable", () => {
    const message =
      "Unable to find a compatible GPU. This issue might be because your computer doesn't have a GPU.";
    expect(classifyInitializationError(new Error(message))).toBe("gpu_unavailable");
  });

  it("classifies a generic error unrelated to memory or network as other_cause", () => {
    expect(classifyInitializationError(new Error("unexpected worker crash"))).toBe("other_cause");
  });

  it("classifies a non-Error value as other_cause", () => {
    expect(classifyInitializationError("fallo desconocido")).toBe("other_cause");
  });
});

describe("SYSTEM_PROMPT", () => {
  it("instructs the model to always answer in Spanish", () => {
    // Guards against silently dropping the language instruction, which was
    // the root cause of the assistant replying in English (e.g. to "hola").
    expect(SYSTEM_PROMPT).toMatch(/español/i);
  });
});
