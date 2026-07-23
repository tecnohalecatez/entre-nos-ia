// ModelDownloadManager: orchestration of `ensureModelAvailable()`.
// See .kiro/specs/asistente-ia-local/design.md (section "Gestor_Descarga_Modelo")
// for design detail and requirements.md (Requisitos 2.1, 2.3, 2.5, 2.6, 8.3, 8.4).
//
// This class orchestrates the download, integrity verification and caching of
// the model weights. Real network and Model_Cache access is received via the
// `ModelDownloadSource` and `ModelCacheStore` interfaces, injected through the
// constructor, to allow substituting them with deterministic test doubles in
// task 7.6 (mocked fetch/Cache API, fake timers for the 30s stall) without
// depending on real I/O.

import { calculateProgress } from "./calculateProgress";
import { verifyIntegrity } from "./verifyIntegrity";

/** Download progress reported incrementally (Requisito 2.2). */
export interface DownloadProgress {
  bytesDownloaded: number;
  totalBytes: number;
  /** integer 0-100, calculated via `calculateProgress()`. */
  percentage: number;
}

/**
 * Configured source from which the model weights and their reference
 * checksum are downloaded (Requisito 2.7: the reference checksum comes from
 * the same configured source the weights are downloaded from).
 */
export interface ModelDownloadSource {
  /** Reference sha256 checksum against which the integrity of the downloaded content is verified. */
  getReferenceChecksum(): Promise<string>;
  /**
   * Downloads the full content of the model weights. Invokes `onChunk` with
   * the bytes received so far and the total expected bytes on each chunk
   * received, enabling incremental progress (2.2). `signal` allows aborting
   * the in-progress download (used on stall detection, 2.6).
   */
  download(
    onChunk: (bytesReceived: number, totalBytes: number) => void,
    signal: AbortSignal,
  ): Promise<ArrayBuffer>;
}

/** Abstraction over the Model_Cache for the model weights. */
export interface ModelCacheStore {
  get(): Promise<ArrayBuffer | null>;
  save(content: ArrayBuffer): Promise<void>;
  remove(): Promise<void>;
}

/** Public interface of the Gestor_Descarga_Modelo (see design.md). */
export interface ModelDownloadManager {
  ensureModelAvailable(onProgress: (p: DownloadProgress) => void): Promise<void>;
}

/** Cause of a definitive failure of `ensureModelAvailable()` (Requisitos 2.6, 8.3, 8.4). */
export type ModelDownloadFailureCause = "aborted" | "stalled" | "invalid_integrity";

/**
 * Typed error thrown by `ensureModelAvailable()` when, after the single
 * retry, the model could not be made available. The caller of this function
 * must catch it and activate Modo_Degradado (Requisito 8.4).
 */
export class ModelDownloadError extends Error {
  override readonly cause: ModelDownloadFailureCause;
  readonly originalCause: unknown;

  constructor(cause: ModelDownloadFailureCause, originalCause?: unknown) {
    super(messageForCause(cause));
    this.name = "ModelDownloadError";
    this.cause = cause;
    this.originalCause = originalCause;
  }
}

function messageForCause(cause: ModelDownloadFailureCause): string {
  switch (cause) {
    case "aborted":
      return "The model weights download was interrupted or rejected by the configured source.";
    case "stalled":
      return "The model weights download made no progress for more than 30 seconds.";
    case "invalid_integrity":
      return "Integrity verification of the downloaded model weights failed.";
  }
}

/** Maximum time without progress before considering the download stalled (Requisito 2.6). */
const STALL_TIMEOUT_MS = 30_000;

/**
 * Implementation of `ModelDownloadManager`.
 *
 * `ensureModelAvailable()`:
 * 1. If the weights are already in `ModelCacheStore` and their integrity is
 *    valid, resolves immediately without downloading (2.5).
 * 2. If cached but the integrity check fails, removes the corrupt file
 *    (8.3) and continues to step 3.
 * 3. Downloads the weights (2.1), reporting incremental progress (2.2) via
 *    `onProgress` and detecting stalls (no progress for more than 30s,
 *    2.6). If the download fails, stalls, or the resulting content's
 *    integrity is invalid, the obtained data is discarded (nothing partial
 *    or corrupt is stored) and the full cycle is retried exactly once. If
 *    any attempt succeeds, the content is saved to `ModelCacheStore` (2.3)
 *    and the function resolves. If the second attempt also fails, a
 *    `ModelDownloadError` is propagated for the caller to activate
 *    Modo_Degradado (8.4).
 */
export class VerifiedModelDownloadManager implements ModelDownloadManager {
  private readonly source: ModelDownloadSource;
  private readonly store: ModelCacheStore;

  constructor(source: ModelDownloadSource, store: ModelCacheStore) {
    this.source = source;
    this.store = store;
  }

  async ensureModelAvailable(onProgress: (p: DownloadProgress) => void): Promise<void> {
    const cachedContent = await this.store.get();
    if (cachedContent !== null) {
      const referenceChecksum = await this.source.getReferenceChecksum();
      const isIntact = await verifyIntegrity(cachedContent, referenceChecksum);
      if (isIntact) {
        return; // 2.5: already available with verified integrity, no re-download.
      }
      await this.store.remove(); // 8.3: the corrupt file is discarded from Model_Cache.
    }

    const firstError = await this.attemptDownloadAndStore(onProgress);
    if (firstError === null) {
      return;
    }

    const secondError = await this.attemptDownloadAndStore(onProgress);
    if (secondError === null) {
      return;
    }

    // 8.4: automatic re-download also failed, propagate for Modo_Degradado.
    throw secondError;
  }

  private async attemptDownloadAndStore(
    onProgress: (p: DownloadProgress) => void,
  ): Promise<ModelDownloadError | null> {
    let content: ArrayBuffer;
    try {
      content = await this.downloadWithStallDetection(onProgress);
    } catch (error) {
      // 2.6: the download failed or stalled; partial data is discarded
      // simply by not storing it.
      return error instanceof ModelDownloadError ? error : new ModelDownloadError("aborted", error);
    }

    const referenceChecksum = await this.source.getReferenceChecksum();
    const isIntact = await verifyIntegrity(content, referenceChecksum);
    if (!isIntact) {
      // The downloaded content does not match the reference checksum:
      // discard it (not stored in Model_Cache).
      return new ModelDownloadError("invalid_integrity");
    }

    await this.store.save(content);
    return null;
  }

  private downloadWithStallDetection(
    onProgress: (p: DownloadProgress) => void,
  ): Promise<ArrayBuffer> {
    const controller = new AbortController();

    return new Promise<ArrayBuffer>((resolve, reject) => {
      let settled = false;
      let timerId: ReturnType<typeof setTimeout> | undefined;

      const settle = (action: () => void): void => {
        if (settled) {
          return;
        }
        settled = true;
        if (timerId !== undefined) {
          clearTimeout(timerId);
        }
        action();
      };

      const resetTimer = (): void => {
        if (timerId !== undefined) {
          clearTimeout(timerId);
        }
        timerId = setTimeout(() => {
          controller.abort();
          settle(() => {
            reject(new ModelDownloadError("stalled"));
          });
        }, STALL_TIMEOUT_MS);
      };

      resetTimer();

      this.source
        .download((bytesReceived, totalBytes) => {
          resetTimer();
          onProgress({
            bytesDownloaded: bytesReceived,
            totalBytes,
            percentage: calculateProgress(bytesReceived, totalBytes),
          });
        }, controller.signal)
        .then((content) => {
          settle(() => {
            resolve(content);
          });
        })
        .catch((error: unknown) => {
          settle(() => {
            reject(new ModelDownloadError("aborted", error));
          });
        });
    });
  }
}
