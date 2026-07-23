import { describe, it } from "vitest";
import fc from "fast-check";
import { verifyIntegrity } from "./verifyIntegrity";

async function sha256Hex(content: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", content);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

const HEX_CHARS = "0123456789abcdef";

function flipHexChar(checksum: string, index: number): string {
  const currentChar = checksum.charAt(index);
  const currentPosition = HEX_CHARS.indexOf(currentChar);
  const newChar = HEX_CHARS.charAt((currentPosition + 1) % HEX_CHARS.length);
  return checksum.slice(0, index) + newChar + checksum.slice(index + 1);
}

describe("verifyIntegrity - property tests", () => {
  // Feature: asistente-ia-local, Property 3: Integrity verification via checksum
  it("returns true for the correct sha256 checksum of the content", async () => {
    await fc.assert(
      fc.asyncProperty(fc.uint8Array({ minLength: 0, maxLength: 256 }), async (bytes) => {
        const content = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        const correctChecksum = await sha256Hex(content);

        const result = await verifyIntegrity(content, correctChecksum);

        return result;
      }),
      { numRuns: 100 },
    );
  });

  // Feature: asistente-ia-local, Property 3: Integrity verification via checksum
  it("returns false when at least one bit of the content is altered", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uint8Array({ minLength: 1, maxLength: 256 }),
        fc.nat(),
        async (bytes, rawIndex) => {
          const content = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
          const correctChecksum = await sha256Hex(content);

          // Alter at least one bit of a byte, guaranteeing the value changes.
          const index = rawIndex % bytes.length;
          const alteredBytes = new Uint8Array(bytes);
          const originalByte = alteredBytes.at(index) ?? 0;
          alteredBytes.set([originalByte ^ 0b00000001], index);
          const alteredContent = alteredBytes.buffer;

          const result = await verifyIntegrity(alteredContent, correctChecksum);

          return !result;
        },
      ),
      { numRuns: 100 },
    );
  });

  // Feature: asistente-ia-local, Property 3: Integrity verification via checksum
  it("returns false when at least one character of the reference checksum is altered", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uint8Array({ minLength: 0, maxLength: 256 }),
        fc.nat({ max: 63 }),
        async (bytes, hexIndex) => {
          const content = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
          const correctChecksum = await sha256Hex(content);

          // Rotate the hex character at that position, guaranteeing a change.
          const alteredChecksum = flipHexChar(correctChecksum, hexIndex);

          const result = await verifyIntegrity(content, alteredChecksum);

          return !result;
        },
      ),
      { numRuns: 100 },
    );
  });
});
