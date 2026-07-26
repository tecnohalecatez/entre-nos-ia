import { describe, it } from "vitest";
import fc from "fast-check";
import { shouldPurgeModelCache } from "./shouldPurgeModelCache";

describe("shouldPurgeModelCache - property tests", () => {
  // Feature: asistente-ia-local, Property 13: Cache_Modelo purge decision on version change
  it("returns true if and only if both version identifiers differ as strings", () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (currentModelVersion, requiredModelVersion) => {
        return (
          shouldPurgeModelCache(currentModelVersion, requiredModelVersion) ===
          (currentModelVersion !== requiredModelVersion)
        );
      }),
      { numRuns: 100 },
    );
  });
});
