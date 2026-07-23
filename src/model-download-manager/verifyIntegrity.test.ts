import { describe, expect, it } from "vitest";
import { verifyIntegrity } from "./verifyIntegrity";

// SHA-256 of "abc" (well-known reference value):
// ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad
const CONTENT_ABC = new TextEncoder().encode("abc").buffer;
const CHECKSUM_ABC = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

describe("verifyIntegrity", () => {
  it("returns true when the checksum matches the content", async () => {
    await expect(verifyIntegrity(CONTENT_ABC, CHECKSUM_ABC)).resolves.toBe(true);
  });

  it("returns true when the reference checksum is uppercase", async () => {
    await expect(
      verifyIntegrity(CONTENT_ABC, CHECKSUM_ABC.toUpperCase()),
    ).resolves.toBe(true);
  });

  it("returns false when a byte of the content is altered", async () => {
    const altered = new TextEncoder().encode("abd").buffer;
    await expect(verifyIntegrity(altered, CHECKSUM_ABC)).resolves.toBe(false);
  });

  it("returns false when the reference checksum does not match", async () => {
    const wrongChecksum =
      "0000000000000000000000000000000000000000000000000000000000000000".slice(0, 64);
    await expect(verifyIntegrity(CONTENT_ABC, wrongChecksum)).resolves.toBe(false);
  });
});
