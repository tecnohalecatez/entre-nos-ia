// Property test of the response generation state machine.
// See .kiro/specs/asistente-ia-local/design.md ("Correctness Properties",
// Property 5) and task 5.2 in tasks.md.

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import type { Message } from "../types/models";
import { reduceGeneration, type GenerationState, type GenerationEvent } from "./reduceGeneration";

const userMessageArbitrary: fc.Arbitrary<Message> = fc.record({
  id: fc.uuid(),
  role: fc.constant("user"),
  content: fc.string(),
  timestamp: fc.integer(),
});

const terminalEventArbitrary: fc.Arbitrary<GenerationEvent> = fc.oneof(
  fc.constant<GenerationEvent>({ type: "complete" }),
  fc.constant<GenerationEvent>({ type: "cancel" }),
  fc.string().map<GenerationEvent>((reason) => ({ type: "error", reason })),
);

describe("reduceGeneration — property test", () => {
  // Feature: asistente-ia-local, Property 5: Transiciones de estado de generación de respuesta
  it("correctly applies the complete/cancel/error terminal transitions", () => {
    fc.assert(
      fc.property(
        userMessageArbitrary,
        fc.string(),
        terminalEventArbitrary,
        (userMessage, partialText, event) => {
          const state: GenerationState = {
            type: "generating",
            userMessage,
            partialText,
          };

          const result = reduceGeneration(state, event);

          switch (event.type) {
            case "complete": {
              expect(result.type).toBe("completed");
              if (result.type === "completed") {
                expect(result.assistantMessage.content).toBe(partialText);
                expect(result.userMessage).toBe(userMessage);
              }
              break;
            }

            case "cancel": {
              expect(result.type).toBe("cancelled");
              if (result.type === "cancelled") {
                expect(result.retainedPartialText).toBe(partialText);
                expect(result.userMessage).toBe(userMessage);
              }
              break;
            }

            case "error": {
              expect(result.type).toBe("error");
              if (result.type === "error") {
                // The partialText generated up until the error must not
                // appear as the assistant message's content: there's no
                // `assistantMessage` in the "error" state, which
                // structurally guarantees the partial text is discarded.
                expect(result).not.toHaveProperty("assistantMessage");
                expect(result.userMessage).toBe(userMessage);
              }
              break;
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
