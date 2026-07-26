// Gestor_Descarga_Modelo: production implementation of `ModelDownloadSource`.
// See .kiro/specs/asistente-ia-local/design.md (section "Gestor_Descarga_Modelo")
// and requirements.md (Requisitos 2.1, 2.2, 2.7).
//
// Downloads the model weights and their reference checksum via the global
// `fetch`, from the configured source (`URL_PESOS_MODELO`/`URL_CHECKSUM_MODELO`
// in `src/app-state/configuration.ts`). The incremental read pattern of the
// `body` as a stream (for progress, 2.2) follows the same approach validated
// in the task 7.6 integration test
// (`ensureModelAvailable.integration.test.ts`), here extracted to a reusable
// production file instead of living only in the test.

import type { ModelDownloadSource } from "./ensureModelAvailable";

/**
 * Real `ModelDownloadSource`, over the global `fetch`.
 *
 * `download()` propagates any network error or non-successful HTTP status by
 * throwing (the caller, `VerifiedModelDownloadManager`, translates it into a
 * `ModelDownloadError` with cause `"aborted"`). The received `AbortSignal` is
 * forwarded to `fetch` to allow cancelling the in-progress download on
 * stall detection (Requisito 2.6).
 */
export class FetchModelDownloadSource implements ModelDownloadSource {
  private readonly weightsUrl: string;
  private readonly checksumUrl: string;

  constructor(weightsUrl: string, checksumUrl: string) {
    this.weightsUrl = weightsUrl;
    this.checksumUrl = checksumUrl;
  }

  async getReferenceChecksum(): Promise<string> {
    const response = await fetch(this.checksumUrl);
    if (!response.ok) {
      throw new Error(`could not fetch the reference checksum: HTTP ${String(response.status)}`);
    }
    return (await response.text()).trim();
  }

  async download(
    onChunk: (bytesReceived: number, totalBytes: number) => void,
    signal: AbortSignal,
  ): Promise<ArrayBuffer> {
    const response = await fetch(this.weightsUrl, { signal });
    if (!response.ok || response.body === null) {
      throw new Error(`weights download failed: HTTP ${String(response.status)}`);
    }

    const totalBytes = Number(response.headers.get("content-length") ?? "0");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytesReceived = 0;

    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      chunks.push(value);
      bytesReceived += value.byteLength;
      onChunk(bytesReceived, totalBytes);
    }

    const combined = new Uint8Array(bytesReceived);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return combined.buffer;
  }
}
