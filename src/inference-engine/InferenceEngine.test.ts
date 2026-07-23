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
    const inferenceEngine = new InferenceEngineWebLLM("test-model", engineFactory);

    await expect(inferenceEngine.initialize("webgpu")).resolves.toBeUndefined();
    expect(engineFactory).toHaveBeenCalledWith("test-model", "webgpu", {});
  });

  it("rejects with EngineInitializationError(cause='insufficient_memory') on a DeviceLostError (Requisito 8.1)", async () => {
    const originalError = new Error("device lost");
    originalError.name = "DeviceLostError";
    const engineFactory: MlcEngineFactory = vi.fn().mockRejectedValue(originalError);
    const inferenceEngine = new InferenceEngineWebLLM("test-model", engineFactory);

    await expect(inferenceEngine.initialize("webgpu")).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(EngineInitializationError);
      expect((error as EngineInitializationError).cause).toBe("insufficient_memory");
      expect((error as EngineInitializationError).originalCause).toBe(originalError);
      return true;
    });
  });

  it("rejects with EngineInitializationError(cause='insufficient_memory') on an out of memory message (Requisito 8.1)", async () => {
    const originalError = new Error("Out of memory while allocating buffer");
    const engineFactory: MlcEngineFactory = vi.fn().mockRejectedValue(originalError);
    const inferenceEngine = new InferenceEngineWebLLM("test-model", engineFactory);

    await expect(inferenceEngine.initialize("wasm")).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(EngineInitializationError);
      expect((error as EngineInitializationError).cause).toBe("insufficient_memory");
      return true;
    });
  });

  it("rejects with EngineInitializationError(cause='other_cause') on a generic memory-unrelated error (Requisito 8.5)", async () => {
    const originalError = new Error("network error");
    const engineFactory: MlcEngineFactory = vi.fn().mockRejectedValue(originalError);
    const inferenceEngine = new InferenceEngineWebLLM("test-model", engineFactory);

    await expect(inferenceEngine.initialize("webgpu")).rejects.toSatisfy((error: unknown) => {
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
    const inferenceEngine = new InferenceEngineWebLLM("test-model", engineFactory);
    await inferenceEngine.initialize("webgpu");

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
      messages: [{ role: "user", content: "hola" }],
      stream: true,
    });
  });

  it("throws if invoked before initialize() has successfully finished", () => {
    const engineFactory: MlcEngineFactory = vi.fn();
    const inferenceEngine = new InferenceEngineWebLLM("test-model", engineFactory);

    expect(() => inferenceEngine.generate([createMessage("user", "hola")])).toThrow();
  });

  it("throws if initialize() previously failed (mlcEngine remains null)", async () => {
    const engineFactory: MlcEngineFactory = vi.fn().mockRejectedValue(new Error("network error"));
    const inferenceEngine = new InferenceEngineWebLLM("test-model", engineFactory);

    await expect(inferenceEngine.initialize("webgpu")).rejects.toBeInstanceOf(EngineInitializationError);
    expect(() => inferenceEngine.generate([createMessage("user", "hola")])).toThrow();
  });
});

describe("InferenceEngineWebLLM.cancel", () => {
  it("invokes the underlying engine's interruptGenerate() after a successful initialization", async () => {
    const { engine, interruptGenerate } = createFakeMlcEngine([]);
    const engineFactory: MlcEngineFactory = vi.fn().mockResolvedValue(engine);
    const inferenceEngine = new InferenceEngineWebLLM("test-model", engineFactory);
    await inferenceEngine.initialize("webgpu");

    inferenceEngine.cancel();

    expect(interruptGenerate).toHaveBeenCalledTimes(1);
  });

  it("does not throw when called before initialize() (no-op)", () => {
    const engineFactory: MlcEngineFactory = vi.fn();
    const inferenceEngine = new InferenceEngineWebLLM("test-model", engineFactory);

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

  it("classifies a generic memory-unrelated Error as other_cause", () => {
    expect(classifyInitializationError(new Error("network error"))).toBe("other_cause");
  });

  it("classifies a non-Error value as other_cause", () => {
    expect(classifyInitializationError("fallo desconocido")).toBe("other_cause");
  });
});
