// Property test for `truncateHistory()`. See `truncateHistory.ts` for the
// design rationale.

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import type { Message } from "../types/models";
import { truncateHistory } from "./truncateHistory";

const messageArbitrary: fc.Arbitrary<Message> = fc.record({
  id: fc.uuid(),
  role: fc.constantFrom("user", "assistant"),
  content: fc.string({ maxLength: 200 }),
  timestamp: fc.integer(),
});

describe("truncateHistory — property test", () => {
  it("never grows the history, always preserves order, and always keeps the last message when history is non-empty", () => {
    fc.assert(
      fc.property(
        fc.array(messageArbitrary, { minLength: 0, maxLength: 30 }),
        fc.nat({ max: 5000 }),
        (history, charBudget) => {
          const result = truncateHistory(history, charBudget);

          // Never grows.
          expect(result.length).toBeLessThanOrEqual(history.length);

          // `result` is a (possibly empty-prefix-trimmed) suffix of
          // `history`: every kept message's relative order among survivors
          // matches its order in the original array.
          const originalIndices = result.map((message) => history.indexOf(message));
          const sortedIndices = [...originalIndices].sort((a, b) => a - b);
          expect(originalIndices).toEqual(sortedIndices);

          // The last message, if any, is always retained.
          if (history.length > 0) {
            expect(result[result.length - 1]).toBe(history[history.length - 1]);
          } else {
            expect(result).toEqual([]);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
