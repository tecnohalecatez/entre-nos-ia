// Unit tests for `CacheApiModelCacheStore` (task 22.2).
// See .kiro/specs/asistente-ia-local/design.md (section "Gestor_Descarga_Modelo")
// and requirements.md (Requisitos 2.3, 2.5, 8.3).
//
// The global Cache API (`caches`) is faked in memory (same minimal approach
// as `ensureModelAvailable.integration.test.ts`, task 7.6), since
// `happy-dom` does not implement it.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CacheApiModelCacheStore, MODEL_CACHE_NAME } from "./ModelCacheStore";

const WEIGHTS_KEY = "https://modelo.local/modelos/pesos.bin";

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

function stubCaches(): FakeCacheStorage {
  const fakeCacheStorage = new FakeCacheStorage();
  (globalThis as unknown as { caches: FakeCacheStorage }).caches = fakeCacheStorage;
  return fakeCacheStorage;
}

describe("CacheApiModelCacheStore", () => {
  let store: CacheApiModelCacheStore;

  beforeEach(() => {
    stubCaches();
    store = new CacheApiModelCacheStore(WEIGHTS_KEY);
  });

  afterEach(() => {
    delete (globalThis as { caches?: unknown }).caches;
  });

  it("get() returns null when nothing is cached", async () => {
    await expect(store.get()).resolves.toBeNull();
  });

  it("save() then get() returns the same content (2.3, 2.5)", async () => {
    const content = new TextEncoder().encode("model-weights").buffer;

    await store.save(content);
    const result = await store.get();

    expect(result).not.toBeNull();
    expect(new Uint8Array(result ?? new ArrayBuffer(0))).toEqual(new Uint8Array(content));
  });

  it("remove() deletes the cached content, leaving get() as null (8.3)", async () => {
    await store.save(new TextEncoder().encode("corrupt-content").buffer);

    await store.remove();

    await expect(store.get()).resolves.toBeNull();
  });

  it("uses the `model-cache` cache name by default, consistent with sw.ts", async () => {
    const fakeCacheStorage = stubCaches();
    let openedName: string | undefined;
    const originalOpen = fakeCacheStorage.open.bind(fakeCacheStorage);
    fakeCacheStorage.open = (name: string) => {
      openedName = name;
      return originalOpen(name);
    };

    await store.get();

    expect(openedName).toBe(MODEL_CACHE_NAME);
    expect(MODEL_CACHE_NAME).toBe("model-cache");
  });
});
