import { describe, it } from "vitest";
import fc from "fast-check";
import { decideResponseSource } from "./decideResponseSource";

describe("decideResponseSource - property tests", () => {
  // Feature: asistente-ia-local, Property 4: Service Worker request resolution strategy
  it("resolves the response source based on connectivity and cache presence", () => {
    fc.assert(
      fc.property(
        fc.record({
          assetsCacheHit: fc.boolean(),
          online: fc.boolean(),
          isModelResource: fc.boolean(),
          modelCacheHit: fc.boolean(),
        }),
        (input) => {
          const result = decideResponseSource(input);
          const matchingCacheHit = input.isModelResource
            ? input.modelCacheHit
            : input.assetsCacheHit;

          if (!input.online) {
            return result === (matchingCacheHit ? "cache" : "no-response");
          }

          if (input.isModelResource && input.modelCacheHit) {
            return result === "cache";
          }

          if (input.isModelResource && !input.modelCacheHit) {
            return result === "network";
          }

          return result === "network-then-cache";
        },
      ),
      { numRuns: 100 },
    );
  });
});
