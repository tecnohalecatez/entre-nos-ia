import { describe, expect, it } from "vitest";
import { decideResponseSource } from "./decideResponseSource";

describe("decideResponseSource", () => {
  it("returns 'cache' when offline and the asset is cached", () => {
    expect(
      decideResponseSource({
        assetsCacheHit: true,
        online: false,
        isModelResource: false,
        modelCacheHit: false,
      }),
    ).toBe("cache");
  });

  it("returns 'no-response' when offline and the asset is not cached", () => {
    expect(
      decideResponseSource({
        assetsCacheHit: false,
        online: false,
        isModelResource: false,
        modelCacheHit: false,
      }),
    ).toBe("no-response");
  });

  it("returns 'cache' when offline and the model resource is cached", () => {
    expect(
      decideResponseSource({
        assetsCacheHit: false,
        online: false,
        isModelResource: true,
        modelCacheHit: true,
      }),
    ).toBe("cache");
  });

  it("returns 'no-response' when offline and the model resource is not cached", () => {
    expect(
      decideResponseSource({
        assetsCacheHit: false,
        online: false,
        isModelResource: true,
        modelCacheHit: false,
      }),
    ).toBe("no-response");
  });

  it("returns 'cache' when online and the model resource is already verified (avoids re-download)", () => {
    expect(
      decideResponseSource({
        assetsCacheHit: false,
        online: true,
        isModelResource: true,
        modelCacheHit: true,
      }),
    ).toBe("cache");
  });

  it("returns 'network' when online and the model resource is not cached", () => {
    expect(
      decideResponseSource({
        assetsCacheHit: false,
        online: true,
        isModelResource: true,
        modelCacheHit: false,
      }),
    ).toBe("network");
  });

  it("returns 'network-then-cache' for assets when online, regardless of whether they are cached", () => {
    expect(
      decideResponseSource({
        assetsCacheHit: true,
        online: true,
        isModelResource: false,
        modelCacheHit: false,
      }),
    ).toBe("network-then-cache");

    expect(
      decideResponseSource({
        assetsCacheHit: false,
        online: true,
        isModelResource: false,
        modelCacheHit: false,
      }),
    ).toBe("network-then-cache");
  });
});
