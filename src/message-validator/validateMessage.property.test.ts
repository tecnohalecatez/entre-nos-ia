import { describe, it } from "vitest";
import fc from "fast-check";
import { validateMessage } from "./validateMessage";

describe("validateMessage - property tests", () => {
  // Feature: asistente-ia-local, Property 6: Validación de mensajes de entrada
  it("marks invalid/empty, invalid/too_long or valid based on trimmed length", () => {
    fc.assert(
      fc.property(fc.string(), (content) => {
        const result = validateMessage(content);
        const trimmed = content.trim();

        if (trimmed.length === 0) {
          return !result.valid && result.reason === "empty";
        }

        if (trimmed.length > 4000) {
          return !result.valid && result.reason === "too_long";
        }

        return result.valid && result.normalizedContent === trimmed;
      }),
      { numRuns: 100 },
    );
  });
});
