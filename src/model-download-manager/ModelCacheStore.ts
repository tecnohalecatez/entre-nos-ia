// Gestor_Descarga_Modelo: production implementation of `ModelCacheStore`.
// See .kiro/specs/asistente-ia-local/design.md (section "Gestor_Descarga_Modelo")
// and requirements.md (Requisitos 2.3, 2.5, 8.3).
//
// Backs the Model_Cache with the global Cache API (`caches`). Uses the same
// cache name (`"model-cache"`) as `src/service-worker-app/sw.ts` (constant
// `CACHE_MODELO`) so that the Motor_Inferencia (main thread, via this store)
// and the Service_Worker_App (when intercepting `/modelos/...` requests)
// read/write the same Cache API entry. Both must be kept manually in sync on
// any name change.

import type { ModelCacheStore } from "./ensureModelAvailable";

/** Cache name used for the model weights (must match `CACHE_MODELO` in `sw.ts`). */
export const MODEL_CACHE_NAME = "model-cache";

/**
 * Real `ModelCacheStore`, over the global Cache API `caches`.
 *
 * `modelWeightsCacheKey` is the URL under which the entry is saved/looked up
 * within the cache (normally the same `weightsUrl` configured for
 * `FetchModelDownloadSource`, so that a real Service_Worker_App request to
 * that URL finds the same cached entry, Requisito 2.5).
 */
export class CacheApiModelCacheStore implements ModelCacheStore {
  private readonly modelWeightsCacheKey: string;
  private readonly cacheName: string;

  constructor(modelWeightsCacheKey: string, cacheName: string = MODEL_CACHE_NAME) {
    this.modelWeightsCacheKey = modelWeightsCacheKey;
    this.cacheName = cacheName;
  }

  async get(): Promise<ArrayBuffer | null> {
    const cache = await caches.open(this.cacheName);
    const response = await cache.match(this.modelWeightsCacheKey);
    if (!response) {
      return null;
    }
    return await response.arrayBuffer();
  }

  async save(content: ArrayBuffer): Promise<void> {
    const cache = await caches.open(this.cacheName);
    await cache.put(this.modelWeightsCacheKey, new Response(content));
  }

  async remove(): Promise<void> {
    const cache = await caches.open(this.cacheName);
    await cache.delete(this.modelWeightsCacheKey);
  }
}
