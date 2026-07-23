// Integration tests for `VerifiedModelDownloadManager` (task 7.6).
//
// Unlike `ensureModelAvailable.test.ts` (simple doubles injected directly as
// `ModelDownloadSource`/`ModelCacheStore`), here the orchestration is
// exercised against concrete implementations of those interfaces that use
// the global `fetch` and the Cache API (`caches.open`/`match`/`put`/
// `delete`), both mocked/faked, to validate the async and timing behavior
// (30s stall) realistically.
//
// `happy-dom` does not provide a Cache API implementation, so a minimal
// in-memory fake is used (`FakeCacheStorage`/`FakeCache`) that implements
// only the surface used by the code under test. `fetch`/`Response`/
// `ReadableStream`/`DOMException` ARE available globally in the test
// environment and are mocked with `vi.stubGlobal`.
//
// See .kiro/specs/asistente-ia-local/design.md (section "Gestor_Descarga_Modelo")
// and requirements.md (2.1, 2.3, 2.5, 2.6, 8.3, 8.4).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ModelDownloadError,
  VerifiedModelDownloadManager,
  type ModelCacheStore,
  type ModelDownloadSource,
} from "./ensureModelAvailable";

const WEIGHTS_URL = "https://modelo.local/pesos.bin";
const CHECKSUM_URL = "https://modelo.local/pesos.bin.sha256";
const MODEL_CACHE_NAME = "model-cache-integration-test";
const MODEL_WEIGHTS_CACHE_KEY = WEIGHTS_URL;

// sha256("abc"), reused as valid reference content/checksum
// (same value used in verifyIntegrity.test.ts).
const VALID_CONTENT = new TextEncoder().encode("abc").buffer;
const VALID_CHECKSUM = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

// --- Minimal in-memory fake of the Cache API (CacheStorage / Cache) -------

class FakeCache {
  private readonly store = new Map<string, Response>();

  match(key: string): Promise<Response | undefined> {
    const response = this.store.get(key);
    return Promise.resolve(response ? response.clone() : undefined);
  }

  put(key: string, response: Response): Promise<void> {
    this.store.set(key, response);
    return Promise.resolve();
  }

  delete(key: string): Promise<boolean> {
    return Promise.resolve(this.store.delete(key));
  }
}

class FakeCacheStorage {
  private readonly cachesByName = new Map<string, FakeCache>();

  open(name: string): Promise<FakeCache> {
    let cache = this.cachesByName.get(name);
    if (!cache) {
      cache = new FakeCache();
      this.cachesByName.set(name, cache);
    }
    return Promise.resolve(cache);
  }
}

// --- Concrete implementations under test, over fetch/Cache API ------------

/** Real `ModelDownloadSource`, over the global `fetch` (mocked in the tests). */
class FetchModelDownloadSource implements ModelDownloadSource {
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

/** Real `ModelCacheStore`, over the global Cache API `caches` (faked in the tests). */
class CacheApiModelCacheStore implements ModelCacheStore {
  async get(): Promise<ArrayBuffer | null> {
    const cache = await getFakeCacheStorage().open(MODEL_CACHE_NAME);
    const response = await cache.match(MODEL_WEIGHTS_CACHE_KEY);
    if (!response) {
      return null;
    }
    return await response.arrayBuffer();
  }

  async save(content: ArrayBuffer): Promise<void> {
    const cache = await getFakeCacheStorage().open(MODEL_CACHE_NAME);
    await cache.put(MODEL_WEIGHTS_CACHE_KEY, new Response(content));
  }

  async remove(): Promise<void> {
    const cache = await getFakeCacheStorage().open(MODEL_CACHE_NAME);
    await cache.delete(MODEL_WEIGHTS_CACHE_KEY);
  }
}

function getFakeCacheStorage(): FakeCacheStorage {
  return (globalThis as unknown as { caches: FakeCacheStorage }).caches;
}

// --- Helper to build a Response with a controllable stream body -----------

interface ControllableResponse {
  response: Response;
  enqueue: (chunk: Uint8Array) => void;
  close: () => void;
  fail: (error: unknown) => void;
}

function createControllableResponse(totalBytes: number): ControllableResponse {
  let controllerRef!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller;
    },
  });
  const response = new Response(stream, {
    status: 200,
    headers: { "content-length": String(totalBytes) },
  });
  return {
    response,
    enqueue: (chunk) => {
      controllerRef.enqueue(chunk);
    },
    close: () => {
      controllerRef.close();
    },
    fail: (error) => {
      controllerRef.error(error);
    },
  };
}

/**
 * Advances fake timers in 0ms increments until `condition()` is true (or
 * `maxAttempts` is exhausted), allowing pending promise/microtask chains to
 * be drained deterministically without depending on real time.
 */
async function waitUntil(condition: () => boolean, maxAttempts = 50): Promise<void> {
  for (let attempt = 0; attempt < maxAttempts && !condition(); attempt++) {
    await vi.advanceTimersByTimeAsync(0);
  }
}

/** Gets the element at `index`, throwing if the array is not long enough (avoids `!`). */
function elementAt<T>(array: T[], index: number): T {
  const element = array[index];
  if (element === undefined) {
    throw new Error(`expected an element at index ${String(index)}`);
  }
  return element;
}

// --- Suite -------------------------------------------------------------

type FetchMock = ReturnType<typeof vi.fn<(url: string, init?: RequestInit) => Promise<Response>>>;

describe("VerifiedModelDownloadManager (integration: fetch + Cache API)", () => {
  let fetchMock: FetchMock;
  let manager: VerifiedModelDownloadManager;

  beforeEach(() => {
    vi.stubGlobal("caches", new FakeCacheStorage());
    fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();
    vi.stubGlobal("fetch", fetchMock);
    const source = new FetchModelDownloadSource(WEIGHTS_URL, CHECKSUM_URL);
    const store = new CacheApiModelCacheStore();
    manager = new VerifiedModelDownloadManager(source, store);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("loads directly from Model_Cache without making any download request when integrity is valid (2.1, 2.5)", async () => {
    const cache = await getFakeCacheStorage().open(MODEL_CACHE_NAME);
    await cache.put(MODEL_WEIGHTS_CACHE_KEY, new Response(VALID_CONTENT));

    fetchMock.mockImplementation((url: string) => {
      if (url === CHECKSUM_URL) {
        return Promise.resolve(new Response(VALID_CHECKSUM));
      }
      throw new Error(`should not download: ${url}`);
    });

    await manager.ensureModelAvailable(vi.fn());

    expect(fetchMock.mock.calls.filter(([url]) => url === WEIGHTS_URL)).toHaveLength(0);
    expect(fetchMock.mock.calls.filter(([url]) => url === CHECKSUM_URL)).toHaveLength(1);
  });

  it("propagates ModelDownloadError with cause 'aborted' after two consecutive network failures, without saving partial content (2.6)", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === CHECKSUM_URL) {
        return Promise.resolve(new Response(VALID_CHECKSUM));
      }
      if (url === WEIGHTS_URL) {
        const control = createControllableResponse(VALID_CONTENT.byteLength);
        control.fail(new TypeError("network error"));
        return Promise.resolve(control.response);
      }
      throw new Error(`unexpected url: ${url}`);
    });

    const error = await manager.ensureModelAvailable(vi.fn()).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ModelDownloadError);
    expect((error as ModelDownloadError).cause).toBe("aborted");
    expect(fetchMock.mock.calls.filter(([url]) => url === WEIGHTS_URL)).toHaveLength(2);
    const cache = await getFakeCacheStorage().open(MODEL_CACHE_NAME);
    expect(await cache.match(MODEL_WEIGHTS_CACHE_KEY)).toBeUndefined();
  });

  it("detects a 30s stall with no progress on both attempts and propagates cause 'stalled' (2.6)", async () => {
    vi.useFakeTimers();
    const controls: ControllableResponse[] = [];

    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === CHECKSUM_URL) {
        return Promise.resolve(new Response(VALID_CHECKSUM));
      }
      if (url === WEIGHTS_URL) {
        const control = createControllableResponse(VALID_CONTENT.byteLength);
        init?.signal?.addEventListener("abort", () => {
          control.fail(new DOMException("The download was aborted", "AbortError"));
        });
        controls.push(control);
        return Promise.resolve(control.response);
      }
      throw new Error(`unexpected url: ${url}`);
    });

    const onProgress = vi.fn();
    // A rejection handler is attached immediately to prevent Node from
    // reporting the promise as "unhandled" during the fake timer advances
    // that happen before the final assertion.
    const promise = manager.ensureModelAvailable(onProgress);
    const outcome = promise.then(
      () => ({ ok: true as const }),
      (error: unknown) => ({ ok: false as const, error }),
    );

    // Attempt 1: a chunk arrives (progress recorded) and then silence.
    await waitUntil(() => controls.length > 0);
    elementAt(controls, 0).enqueue(new Uint8Array([97]));
    await waitUntil(() => onProgress.mock.calls.length > 0);

    await vi.advanceTimersByTimeAsync(30_000); // triggers the attempt 1 stall
    await vi.advanceTimersByTimeAsync(0);

    // Attempt 2 (single retry): same pattern, also stalls.
    await waitUntil(() => controls.length > 1);
    elementAt(controls, 1).enqueue(new Uint8Array([97]));
    await waitUntil(() => onProgress.mock.calls.length > 1);

    await vi.advanceTimersByTimeAsync(30_000); // triggers the attempt 2 stall
    await vi.advanceTimersByTimeAsync(0);

    const result = await outcome;
    const error = result.ok ? undefined : result.error;
    expect(error).toBeInstanceOf(ModelDownloadError);
    expect((error as ModelDownloadError).cause).toBe("stalled");
    expect(controls).toHaveLength(2);
  });

  it("removes the corrupt cached file, re-downloads and saves the new valid content (8.3)", async () => {
    const cache = await getFakeCacheStorage().open(MODEL_CACHE_NAME);
    await cache.put(MODEL_WEIGHTS_CACHE_KEY, new Response(new TextEncoder().encode("corrupt-content").buffer));

    fetchMock.mockImplementation((url: string) => {
      if (url === CHECKSUM_URL) {
        return Promise.resolve(new Response(VALID_CHECKSUM));
      }
      if (url === WEIGHTS_URL) {
        const control = createControllableResponse(VALID_CONTENT.byteLength);
        control.enqueue(new Uint8Array(VALID_CONTENT));
        control.close();
        return Promise.resolve(control.response);
      }
      throw new Error(`unexpected url: ${url}`);
    });

    await manager.ensureModelAvailable(vi.fn());

    expect(fetchMock.mock.calls.filter(([url]) => url === WEIGHTS_URL)).toHaveLength(1);
    const finalResponse = await cache.match(MODEL_WEIGHTS_CACHE_KEY);
    expect(finalResponse).toBeDefined();
    const finalContent = await finalResponse?.arrayBuffer();
    expect(new Uint8Array(finalContent ?? new ArrayBuffer(0))).toEqual(new Uint8Array(VALID_CONTENT));
  });

  it("propagates a definitive failure when the second attempt also fails (invalid integrity after interruption), never saving (8.4)", async () => {
    let weightsAttemptNumber = 0;

    fetchMock.mockImplementation((url: string) => {
      if (url === CHECKSUM_URL) {
        return Promise.resolve(new Response(VALID_CHECKSUM));
      }
      if (url === WEIGHTS_URL) {
        weightsAttemptNumber += 1;
        if (weightsAttemptNumber === 1) {
          // First attempt: network interruption.
          const control = createControllableResponse(VALID_CONTENT.byteLength);
          control.fail(new TypeError("network error"));
          return Promise.resolve(control.response);
        }
        // Second attempt: the download completes, but the content does not
        // match the reference checksum (invalid integrity).
        const control = createControllableResponse(3);
        control.enqueue(new TextEncoder().encode("xyz"));
        control.close();
        return Promise.resolve(control.response);
      }
      throw new Error(`unexpected url: ${url}`);
    });

    const error = await manager.ensureModelAvailable(vi.fn()).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ModelDownloadError);
    expect((error as ModelDownloadError).cause).toBe("invalid_integrity");
    expect(weightsAttemptNumber).toBe(2);
    const cache = await getFakeCacheStorage().open(MODEL_CACHE_NAME);
    expect(await cache.match(MODEL_WEIGHTS_CACHE_KEY)).toBeUndefined();
  });
});
