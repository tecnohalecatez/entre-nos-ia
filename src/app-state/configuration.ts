// App_State: boot configuration shared by `AppStateProvider`.
//
// The two model identifiers below must be kept manually in sync with the
// version marker in `src/service-worker-app/sw.ts` (same design note there:
// in the absence of a build-level model-versioning pipeline, they are fixed
// as source-code constants).
//
// Both must match EXACTLY a `model_id` from WebLLM's prebuilt model catalog
// (`webllm.prebuiltAppConfig.model_list`, hosted by MLC-AI on Hugging Face)
// -- WebLLM resolves and downloads the weight shards for this id
// automatically when calling `CreateMLCEngine(modelId)` (see
// `InferenceEngine.ts`), without needing our own origin URL. See the full
// list of valid ids at
// https://github.com/mlc-ai/web-llm/blob/main/src/config.ts.
import type { ModelTier } from "../compatibility-detector/decide";

/**
 * Full-size model, used on desktop-class devices (`modelTier === "full"`).
 * `vram_required_MB: 2263.69` per WebLLM's catalog (~2.26 GB).
 */
export const MODEL_ID_FULL = "Llama-3.2-3B-Instruct-q4f16_1-MLC";

/**
 * Compact model, used on memory-constrained devices such as phones
 * (`modelTier === "compact"`). Same family and chat template as
 * `MODEL_ID_FULL`, so `SYSTEM_PROMPT` and Spanish-response behavior are
 * unaffected by which one is loaded.
 * `vram_required_MB: 879.04` per WebLLM's catalog (~0.88 GB, ~2.6x less).
 *
 * Introduced to avoid the renderer OOM-crash a full-size model causes on
 * phones: `navigator.deviceMemory` reports device RAM quantized to powers
 * of 2 and capped at 8, so a typical phone reads the same 4-8 GB as a
 * modest laptop and would otherwise pass the Degraded_Mode memory gate
 * (`decide.ts`, `MIN_MEMORY_GB`) while still being unable to actually hold
 * 2.26 GB of model weights in the renderer process.
 */
export const MODEL_ID_COMPACT = "Llama-3.2-1B-Instruct-q4f16_1-MLC";

/** Maps the pure `modelTier` decided by `decide()` to the model to load. */
export function modelIdForTier(tier: ModelTier): string {
  return tier === "compact" ? MODEL_ID_COMPACT : MODEL_ID_FULL;
}

// --- Model download and caching (Requirements 2.1, 2.3, 2.5) ---------------
//
// WebLLM manages downloading and caching the model weights internally
// (browser Cache API) when initializing `MLCEngine` with the resolved model
// id: it downloads the shards the first time and reuses them from cache on
// subsequent initializations, directly satisfying 2.1/2.3/2.5 without
// needing our own download/checksum pipeline or an origin URL configured by
// this project (there's no backend/CDN of our own, see design.md, pillar
// "Zero application server at runtime").
//
// The `ModelDownloadManager` in `src/model-download-manager/` (with sha256
// checksum integrity verification, Property 3) still exists as an
// independently-tested component (Property-Based Testing), but
// `AppStateProvider` does NOT invoke it during real boot: there's no single
// weight file for that pipeline to target, since WebLLM splits the weights
// into multiple shards resolved internally from the model id, not from a
// single-file URL.
