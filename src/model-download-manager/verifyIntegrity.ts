// Gestor_Descarga_Modelo: integrity verification via sha256 checksum.
// See .kiro/specs/asistente-ia-local/design.md (section "Gestor_Descarga_Modelo")
// for design detail and .kiro/specs/asistente-ia-local/requirements.md (2.4, 2.7).

/**
 * Function subject to PBT (Property 3): verifies that the downloaded binary
 * content matches the reference sha256 checksum.
 *
 * true <=> sha256Hex(content) === referenceChecksum
 * (case-insensitive comparison).
 */
export async function verifyIntegrity(
  content: ArrayBuffer,
  referenceChecksum: string,
): Promise<boolean> {
  const calculatedChecksum = await sha256Hex(content);
  return calculatedChecksum.toLowerCase() === referenceChecksum.toLowerCase();
}

async function sha256Hex(content: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", content);
  return bufferToHex(digest);
}

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
