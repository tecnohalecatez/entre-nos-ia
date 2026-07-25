import { describe, expect, it } from "vitest";
import { isScrolledToBottom, BOTTOM_THRESHOLD_PX } from "./isScrolledToBottom";

describe("isScrolledToBottom", () => {
  it("is true at the exact bottom (distance 0)", () => {
    expect(isScrolledToBottom({ scrollTop: 900, scrollHeight: 1000, clientHeight: 100 })).toBe(true);
  });

  it("is true within the default threshold", () => {
    const distance = BOTTOM_THRESHOLD_PX - 1;
    expect(
      isScrolledToBottom({ scrollTop: 1000 - 100 - distance, scrollHeight: 1000, clientHeight: 100 }),
    ).toBe(true);
  });

  it("is false past the default threshold", () => {
    const distance = BOTTOM_THRESHOLD_PX + 1;
    expect(
      isScrolledToBottom({ scrollTop: 1000 - 100 - distance, scrollHeight: 1000, clientHeight: 100 }),
    ).toBe(false);
  });

  it("is true when the content is shorter than the viewport (nothing to scroll)", () => {
    expect(isScrolledToBottom({ scrollTop: 0, scrollHeight: 80, clientHeight: 100 })).toBe(true);
  });

  it("honors a custom threshold", () => {
    expect(
      isScrolledToBottom({ scrollTop: 700, scrollHeight: 1000, clientHeight: 100 }, 250),
    ).toBe(true);
    expect(
      isScrolledToBottom({ scrollTop: 700, scrollHeight: 1000, clientHeight: 100 }, 150),
    ).toBe(false);
  });
});
