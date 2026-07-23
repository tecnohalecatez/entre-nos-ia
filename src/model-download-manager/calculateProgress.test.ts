import { describe, expect, it } from "vitest";
import { calculateProgress } from "./calculateProgress";

describe("calculateProgress", () => {
  it("returns 0 when nothing has been downloaded", () => {
    expect(calculateProgress(0, 1000)).toBe(0);
  });

  it("returns 100 when the download is complete", () => {
    expect(calculateProgress(1000, 1000)).toBe(100);
  });

  it("rounds to the nearest integer", () => {
    expect(calculateProgress(1, 3)).toBe(33);
    expect(calculateProgress(2, 3)).toBe(67);
  });

  it("clamps to 100 if bytesDownloaded exceeds totalBytes", () => {
    expect(calculateProgress(1200, 1000)).toBe(100);
  });
});
