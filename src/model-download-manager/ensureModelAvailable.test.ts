// Basic unit tests for `VerifiedModelDownloadManager` with dependencies
// (`ModelDownloadSource`, `ModelCacheStore`) injected as simple doubles.
// Exhaustive integration tests (mocked fetch/Cache API, fake timers for the
// 30s stall) are task 7.6.
import { describe, expect, it, vi } from "vitest";
import {
  ModelDownloadError,
  VerifiedModelDownloadManager,
  type ModelCacheStore,
  type ModelDownloadSource,
} from "./ensureModelAvailable";

// SHA-256 of "abc" (same reference value used in verifyIntegrity.test.ts).
const CONTENT_ABC = new TextEncoder().encode("abc").buffer;
const CHECKSUM_ABC = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
const WRONG_CHECKSUM = "0".repeat(64);

function createFakeSource(downloadImpl?: ModelDownloadSource["download"]): {
  source: ModelDownloadSource;
  getReferenceChecksum: ReturnType<typeof vi.fn>;
  download: ReturnType<typeof vi.fn>;
} {
  const getReferenceChecksum = vi.fn().mockResolvedValue(CHECKSUM_ABC);
  const download = vi.fn(
    downloadImpl ??
      ((onChunk: (bytesReceived: number, totalBytes: number) => void) => {
        onChunk(CONTENT_ABC.byteLength, CONTENT_ABC.byteLength);
        return Promise.resolve(CONTENT_ABC);
      }),
  );
  const source: ModelDownloadSource = {
    getReferenceChecksum,
    download,
  };
  return { source, getReferenceChecksum, download };
}

function createFakeStore(initialContent: ArrayBuffer | null = null): {
  store: ModelCacheStore;
  get: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
} {
  const get = vi.fn().mockResolvedValue(initialContent);
  const save = vi.fn().mockResolvedValue(undefined);
  const remove = vi.fn().mockResolvedValue(undefined);
  const store: ModelCacheStore = {
    get: get as ModelCacheStore["get"],
    save: save as ModelCacheStore["save"],
    remove: remove as ModelCacheStore["remove"],
  };
  return { store, get, save, remove };
}

describe("VerifiedModelDownloadManager.ensureModelAvailable", () => {
  it("downloads, verifies integrity and saves to Model_Cache when nothing is cached (2.1, 2.3)", async () => {
    const { source, download } = createFakeSource();
    const { store, save } = createFakeStore();
    const manager = new VerifiedModelDownloadManager(source, store);
    const onProgress = vi.fn();

    await manager.ensureModelAvailable(onProgress);

    expect(download).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(CONTENT_ABC);
    expect(onProgress).toHaveBeenCalledWith({
      bytesDownloaded: CONTENT_ABC.byteLength,
      totalBytes: CONTENT_ABC.byteLength,
      percentage: 100,
    });
  });

  it("does not download if the weights are already cached with verified integrity (2.5)", async () => {
    const { source, download } = createFakeSource();
    const { store, save } = createFakeStore(CONTENT_ABC);
    const manager = new VerifiedModelDownloadManager(source, store);

    await manager.ensureModelAvailable(vi.fn());

    expect(download).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it("removes the corrupt cached file and re-downloads (8.3)", async () => {
    const { source, download } = createFakeSource();
    const corruptContent = new TextEncoder().encode("corrupt-content").buffer;
    const { store, remove, save } = createFakeStore(corruptContent);
    const manager = new VerifiedModelDownloadManager(source, store);

    await manager.ensureModelAvailable(vi.fn());

    expect(remove).toHaveBeenCalledTimes(1);
    expect(download).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(CONTENT_ABC);
  });

  it("retries once on invalid integrity and saves if the retry succeeds", async () => {
    const { source, download, getReferenceChecksum } = createFakeSource();
    getReferenceChecksum
      .mockReset()
      .mockResolvedValueOnce(WRONG_CHECKSUM) // first attempt: verification fails
      .mockResolvedValueOnce(CHECKSUM_ABC); // retry: matches
    const { store, save } = createFakeStore();
    const manager = new VerifiedModelDownloadManager(source, store);

    await manager.ensureModelAvailable(vi.fn());

    expect(download).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("propagates ModelDownloadError after the second consecutive failure (2.6, 8.4)", async () => {
    const { source, download } = createFakeSource(() =>
      Promise.reject(new Error("network unavailable")),
    );
    const { store, save } = createFakeStore();
    const manager = new VerifiedModelDownloadManager(source, store);

    await expect(manager.ensureModelAvailable(vi.fn())).rejects.toBeInstanceOf(ModelDownloadError);
    expect(download).toHaveBeenCalledTimes(2);
    expect(save).not.toHaveBeenCalled();
  });
});
