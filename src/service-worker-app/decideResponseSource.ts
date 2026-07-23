// Pure request-resolution function of the Service_Worker_App.
// See .kiro/specs/asistente-ia-local/design.md (section "Service_Worker_App")
// for the design detail of this function.

/** Resolution strategy chosen by the Service Worker for a given request. */
export type ResponseSource = "cache" | "network" | "network-then-cache" | "no-response";

export interface DecideResponseSourceInput {
  /** true if the requested resource is present in Cache_Assets. */
  assetsCacheHit: boolean;
  /** true if the browser has network connectivity. */
  online: boolean;
  /** true if the request corresponds to a model weights resource. */
  isModelResource: boolean;
  /** true if the model resource is present (and verified) in Cache_Modelo. */
  modelCacheHit: boolean;
}

/**
 * PURE function subjected to PBT (Property 4).
 *
 * Rules (derived from Requisitos 3.4, 3.5, 3.6):
 * - If `!online`: responds from the matching cache if present
 *   (`"cache"`); if not present, `"no-response"` (triggers the 3.5
 *   blocking flow).
 * - If `online`:
 *   - For model resources already verified in Cache_Modelo, `"cache"`
 *     (avoids re-download, 2.5).
 *   - For model resources NOT cached, `"network"` (they need to be downloaded).
 *   - For assets, always *stale-while-revalidate* (`"network-then-cache"`).
 */
export function decideResponseSource(input: DecideResponseSourceInput): ResponseSource {
  const { assetsCacheHit, online, isModelResource, modelCacheHit } = input;
  const matchingCacheHit = isModelResource ? modelCacheHit : assetsCacheHit;

  if (!online) {
    return matchingCacheHit ? "cache" : "no-response";
  }

  if (isModelResource) {
    return modelCacheHit ? "cache" : "network";
  }

  return "network-then-cache";
}
