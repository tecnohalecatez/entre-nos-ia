import { describe, it } from "vitest";
import fc from "fast-check";
import { calculateProgress } from "./calculateProgress";

describe("calculateProgress - property tests", () => {
  // Feature: asistente-ia-local, Property 2: Download progress calculation
  it("calculates the rounded percentage and always keeps it in [0, 100]", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10_000_000 }).chain((totalBytes) =>
          fc.tuple(
            fc.constant(totalBytes),
            fc.integer({ min: 0, max: totalBytes }),
          ),
        ),
        ([totalBytes, bytesDownloaded]) => {
          const result = calculateProgress(bytesDownloaded, totalBytes);
          const expected = Math.round((bytesDownloaded / totalBytes) * 100);

          return (
            result === expected && result >= 0 && result <= 100
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});
