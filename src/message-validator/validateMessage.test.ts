import { describe, expect, it } from "vitest";
import { validateMessage } from "./validateMessage";

describe("validateMessage", () => {
  it("rejects an empty message", () => {
    expect(validateMessage("")).toEqual({ valid: false, reason: "empty" });
  });

  it("rejects a message that only contains whitespace", () => {
    expect(validateMessage("   \n\t  ")).toEqual({
      valid: false,
      reason: "empty",
    });
  });

  it("trims whitespace from both ends of a valid message", () => {
    expect(validateMessage("  hola mundo  ")).toEqual({
      valid: true,
      normalizedContent: "hola mundo",
    });
  });

  it("accepts a message of exactly 4000 characters", () => {
    const content = "a".repeat(4000);
    expect(validateMessage(content)).toEqual({
      valid: true,
      normalizedContent: content,
    });
  });

  it("rejects a message of 4001 characters as too long", () => {
    const content = "a".repeat(4001);
    expect(validateMessage(content)).toEqual({
      valid: false,
      reason: "too_long",
    });
  });
});
