// Service_Worker_App: source script of the Service Worker, compiled and
// injected by `vite-plugin-pwa` (`injectManifest` strategy).
// See .kiro/specs/asistente-ia-local/design.md (section "Service_Worker_App")
// and requirements.md (Requisitos 3, 9, 11) for the design detail.
//
// This file's responsibilities (task 9.5):
// - Precaching the static assets generated at build (`self.__WB_MANIFEST`)
//   and serving them with a *stale-while-revalidate* strategy (Cache_Assets, 3.2, 3.6).
// - Registration of the `fetch` handler that routes model resource
//   requests to the manual handling (cache-first + integrity) described in
//   design.md for Cache_Modelo, using `decideResponseSource()` as the sole
//   decision function (3.4, 3.5, 3.6).
//
// The update lifecycle (Requisito 9, task 9.6):
// - `skipWaiting()` deferred until the explicit `{type: "SKIP_WAITING"}`
//   message sent by the client (see `registerServiceWorker.ts` /
//   `serviceWorkerUpdateController.ts`), triggered only when the
//   user accepts the update and `GenerationState.type !== "generating"`
//   (9.2, 9.4, 9.5). If the user dismisses the notification, the message is
//   simply never sent and this Service Worker stays waiting without
//   interrupting the active version (9.6).
// - When the new version activates, the model version required by this
//   build is compared against the stored one and Cache_Modelo is purged if
//   they differ (9.3), delegating the pure decision to `shouldPurgeModelCache`
//   via `manageModelCacheVersion`.

/// <reference lib="webworker" />

import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { StaleWhileRevalidate } from "workbox-strategies";
import { decideResponseSource } from "./decideResponseSource";
import {
  manageModelCacheVersion,
  type ModelVersionStore,
} from "./manageModelCacheVersion";

declare let self: ServiceWorkerGlobalScope;

// --- Cache_Assets: precache generated at build + stale-while-revalidate ---
//
// `precacheAndRoute` already registers the serving route for precached
// assets using the default precache strategy (cache-first over the
// installed revision). To explicitly comply with the
// *stale-while-revalidate* strategy required by the design (Cache_Assets,
// 3.2, 3.6) for HTML/CSS/JS assets, an additional `StaleWhileRevalidate`
// route is registered for same-origin navigations and assets that are not
// model resources; this route revalidates against the network in the
// background when there is connectivity, and serves from cache when there
// isn't.
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

const ASSETS_CACHE_NAME = "cache-assets-runtime";
const MODEL_CACHE_NAME = "model-cache";

/** Path prefix under which the model weights are served (Cache_Modelo). */
const MODEL_RESOURCE_PREFIX = "/models/";

function isModelResource(url: URL): boolean {
  return url.pathname.startsWith(MODEL_RESOURCE_PREFIX);
}

registerRoute(
  ({ request, url }) =>
    (request.mode === "navigate" || request.destination !== "") &&
    self.location.origin === url.origin &&
    !isModelResource(url),
  new StaleWhileRevalidate({ cacheName: ASSETS_CACHE_NAME }),
);

// --- Cache_Modelo: manual handling (cache-first + integrity verification) ---
//
// Explicitly NOT delegated to Workbox (see design.md), to allow incremental
// download progress and checksum verification before considering a weights
// file "available" (task 7.5, Gestor_Descarga_Modelo). Only request routing
// is resolved here, via `decideResponseSource()`; the download orchestration
// with progress and integrity verification lives in Gestor_Descarga_Modelo.
self.addEventListener("fetch", (event: FetchEvent) => {
  const url = new URL(event.request.url);
  if (!isModelResource(url)) {
    return;
  }

  event.respondWith(resolveModelRequest(event.request));
});

async function resolveModelRequest(request: Request): Promise<Response> {
  const cache = await self.caches.open(MODEL_CACHE_NAME);
  const cachedResponse = await cache.match(request);

  const source = decideResponseSource({
    assetsCacheHit: false,
    online: self.navigator.onLine,
    isModelResource: true,
    modelCacheHit: cachedResponse !== undefined,
  });

  switch (source) {
    case "cache": {
      // Should not happen without a cached entry (decideResponseSource only
      // returns "cache" when modelCacheHit is true), but handled defensively
      // in case the entry was evicted between the decision and the match.
      return cachedResponse ?? fetch(request);
    }
    case "network": {
      // The download with incremental progress and checksum verification is
      // orchestrated by Gestor_Descarga_Modelo (task 7.5); here the network
      // request is simply let through. Saving into Cache_Modelo happens
      // after verifying integrity, not in this handler.
      return fetch(request);
    }
    case "no-response":
    default: {
      return new Response(null, { status: 503, statusText: "Offline and no model cache" });
    }
  }
}

// --- Update lifecycle (Requisito 9, task 9.6) ---

/**
 * Model set that this build of the Service_Worker_App requires.
 *
 * DESIGN NOTE: in the absence of a build-level model versioning pipeline,
 * this is fixed here as a source constant (identifier of the model set
 * supported by this app version, see `MetadatosModeloCacheado` in
 * design.md). If in the future the required models vary between builds,
 * this value should be injected via Vite's `define` at build time; the rest
 * of the flow (`manageModelCacheVersion`, `shouldPurgeModelCache`) would not
 * need to change.
 *
 * Since the app loads one of two models depending on device capability
 * (`MODEL_ID_FULL`/`MODEL_ID_COMPACT` in `src/app-state/configuration.ts`,
 * Requirement 1), this identifies the *set* the build supports rather than
 * a single model: it must change whenever that set changes (so
 * `shouldPurgeModelCache` still purges stale weights on a real model-set
 * change), but must NOT vary per device/tier -- doing so would purge
 * Cache_Modelo on every activation for devices on the compact tier.
 */
const REQUIRED_MODEL_VERSION = "llama-3.2-3b+1b-q4f16_1";

/** Small cache name used only to persist the active model version marker. */
const MODEL_CACHE_METADATA_NAME = "model-cache-metadata";
/** Key (synthetic URL) under which the version marker is stored inside `MODEL_CACHE_METADATA_NAME`. */
const MODEL_VERSION_KEY = "https://sw-metadata.local/active-model-version";

/** `ModelVersionStore` backed by the Cache API (available in the Service Worker context). */
const modelVersionStore: ModelVersionStore = {
  async get() {
    const cache = await self.caches.open(MODEL_CACHE_METADATA_NAME);
    const response = await cache.match(MODEL_VERSION_KEY);
    return response ? await response.text() : undefined;
  },
  async save(version: string) {
    const cache = await self.caches.open(MODEL_CACHE_METADATA_NAME);
    await cache.put(MODEL_VERSION_KEY, new Response(version));
  },
};

async function purgeModelCache(): Promise<void> {
  await self.caches.delete(MODEL_CACHE_NAME);
}

// Deferred `skipWaiting()`: by default Workbox keeps the new version in
// "waiting" state until it receives this explicit message from the client,
// sent only when the user accepts the update and there is no generation in
// progress (9.2, 9.4, 9.5; see `serviceWorkerUpdateController.ts`).
self.addEventListener("message", (event: ExtendableMessageEvent) => {
  if ((event.data as { type?: string } | undefined)?.type === "SKIP_WAITING") {
    void self.skipWaiting();
  }
});

// When this version activates (right after `skipWaiting()`), the
// Cache_Modelo purge due to a required-version change (9.3) is resolved
// before the Service Worker starts controlling pages.
self.addEventListener("activate", (event: ExtendableEvent) => {
  event.waitUntil(
    manageModelCacheVersion(REQUIRED_MODEL_VERSION, {
      versionStore: modelVersionStore,
      purgeModelCache,
    }),
  );
});
