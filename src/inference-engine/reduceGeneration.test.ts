// Unit (example-based) tests for the pure `reduceGeneration` function.
// The comprehensive property test (Property 5) is implemented in task 5.2.

import { describe, expect, it } from "vitest";
import type { Message } from "../types/models";
import { reduceGeneration, type GenerationState } from "./reduceGeneration";

function createUserMessage(content: string): Message {
  return {
    id: "user-1",
    role: "user",
    content,
    timestamp: 1_000,
  };
}

describe("reduceGeneration", () => {
  it("accumulates text in partialText when receiving a chunk in the generating state", () => {
    const userMessage = createUserMessage("Hola");
    const state: GenerationState = {
      type: "generating",
      userMessage,
      partialText: "Ho",
    };

    const result = reduceGeneration(state, { type: "chunk", text: "la" });

    expect(result).toEqual({
      type: "generating",
      userMessage,
      partialText: "Hola",
    });
  });

  it("transitions to completed with assistantMessage equal to the accumulated partialText", () => {
    const userMessage = createUserMessage("Hola");
    const state: GenerationState = {
      type: "generating",
      userMessage,
      partialText: "Hola, ¿cómo estás?",
    };

    const result = reduceGeneration(state, { type: "complete" });

    expect(result.type).toBe("completed");
    if (result.type === "completed") {
      expect(result.assistantMessage.content).toBe("Hola, ¿cómo estás?");
      expect(result.assistantMessage.role).toBe("assistant");
      expect(result.userMessage).toBe(userMessage);
    }
  });

  it("transitions to cancelled preserving exactly the partialText", () => {
    const userMessage = createUserMessage("Hola");
    const state: GenerationState = {
      type: "generating",
      userMessage,
      partialText: "Texto parcial",
    };

    const result = reduceGeneration(state, { type: "cancel" });

    expect(result).toEqual({
      type: "cancelled",
      userMessage,
      retainedPartialText: "Texto parcial",
    });
  });

  it("transitions to error discarding the accumulated partialText", () => {
    const userMessage = createUserMessage("Hola");
    const state: GenerationState = {
      type: "generating",
      userMessage,
      partialText: "Texto que no debe aparecer",
    };

    const result = reduceGeneration(state, { type: "error", reason: "fallo de red" });

    expect(result).toEqual({
      type: "error",
      userMessage,
      error: "fallo de red",
    });
  });

  it("ignores events received outside the generating state", () => {
    const state: GenerationState = { type: "idle" };

    const result = reduceGeneration(state, { type: "complete" });

    expect(result).toBe(state);
  });

  it("'start' transitions to generating with empty partialText from idle", () => {
    const userMessage = createUserMessage("Hola");
    const state: GenerationState = { type: "idle" };

    const result = reduceGeneration(state, { type: "start", userMessage });

    expect(result).toEqual({
      type: "generating",
      userMessage,
      partialText: "",
    });
  });

  it("'start' transitions to generating even from a previous terminal state (retry, 8.2)", () => {
    const previousUserMessage = createUserMessage("mensaje anterior");
    const errorState: GenerationState = {
      type: "error",
      userMessage: previousUserMessage,
      error: "fallo de generación",
    };
    const newUserMessage = createUserMessage("reintento");

    const result = reduceGeneration(errorState, { type: "start", userMessage: newUserMessage });

    expect(result).toEqual({
      type: "generating",
      userMessage: newUserMessage,
      partialText: "",
    });
  });
});
