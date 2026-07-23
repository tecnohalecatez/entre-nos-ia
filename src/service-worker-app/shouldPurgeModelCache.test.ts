import { describe, expect, it } from "vitest";
import { shouldPurgeModelCache } from "./shouldPurgeModelCache";

describe("shouldPurgeModelCache", () => {
  it("returns false when both versions are equal", () => {
    expect(shouldPurgeModelCache("v1", "v1")).toBe(false);
  });

  it("returns true when the versions differ", () => {
    expect(shouldPurgeModelCache("v1", "v2")).toBe(true);
  });

  it("returns true when the current version is an empty string and the required one is not", () => {
    expect(shouldPurgeModelCache("", "v1")).toBe(true);
  });

  it("returns false when both versions are empty strings", () => {
    expect(shouldPurgeModelCache("", "")).toBe(false);
  });
});
