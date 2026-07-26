// Gestor_Descarga_Modelo: download progress calculation.
// See .kiro/specs/asistente-ia-local/design.md (section "Gestor_Descarga_Modelo")
// for design detail and .kiro/specs/asistente-ia-local/requirements.md (2.2).

/**
 * PURE function subject to PBT (Property 2): calculates the download
 * progress percentage from the bytes downloaded and the total expected
 * bytes.
 *
 * percentage = Math.round((bytesDownloaded / totalBytes) * 100),
 * clamped to the range [0, 100] as a defensive measure against inputs
 * outside the expected domain (e.g. bytesDownloaded > totalBytes).
 */
export function calculateProgress(bytesDownloaded: number, totalBytes: number): number {
  const percentage = Math.round((bytesDownloaded / totalBytes) * 100);
  return Math.min(100, Math.max(0, percentage));
}
