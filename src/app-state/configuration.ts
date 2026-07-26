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
 * Full-size model, used on desktop-class devices (`modelTier === "full"`)
 * whose WebGPU adapter supports `shader-f16` (`shaderF16Available === true`,
 * the common case). `vram_required_MB: 2263.69` per WebLLM's catalog
 * (~2.26 GB).
 */
export const MODEL_ID_FULL = "Llama-3.2-3B-Instruct-q4f16_1-MLC";

/**
 * `q4f32_1` fallback for `MODEL_ID_FULL`, used when `shaderF16Available` is
 * false: same size tier, but doesn't require the `shader-f16` WebGPU
 * extension (`required_features` is absent from this catalog entry).
 * Heavier than `MODEL_ID_FULL` (`vram_required_MB: 2951.51`, ~2.95 GB)
 * since f32 weights take more space than f16 -- an acceptable tradeoff on
 * desktop-class hardware in exchange for not needing an optional GPU
 * feature at all.
 */
export const MODEL_ID_FULL_F32 = "Llama-3.2-3B-Instruct-q4f32_1-MLC";

/**
 * Compact model, used on memory-constrained devices such as phones
 * (`modelTier === "compact"`) whose adapter supports `shader-f16`. Same
 * family and chat template as `MODEL_ID_FULL`, so `SYSTEM_PROMPT` and
 * Spanish-response behavior are unaffected by which one is loaded.
 * `vram_required_MB: 879.04` per WebLLM's catalog (~0.88 GB, ~2.6x less
 * than `MODEL_ID_FULL`).
 *
 * Introduced to avoid the renderer OOM-crash a full-size model causes on
 * phones: `navigator.deviceMemory` reports device RAM quantized to powers
 * of 2 and capped at 8, so a typical phone reads the same 4-8 GB as a
 * modest laptop and would otherwise pass the Degraded_Mode memory gate
 * (`decide.ts`, `MIN_MEMORY_GB`) while still being unable to actually hold
 * 2.26 GB of model weights in the renderer process.
 */
export const MODEL_ID_COMPACT = "Llama-3.2-1B-Instruct-q4f16_1-MLC";

/**
 * `q4f32_1` fallback for `MODEL_ID_COMPACT`, used when `shaderF16Available`
 * is false: `vram_required_MB: 1128.82` (~1.13 GB) per WebLLM's catalog --
 * still well under the full-size model's footprint, so it stays safe for
 * memory-constrained devices. This is the variant that fixes phones whose
 * GPU driver exposes WebGPU but not the `shader-f16` extension (common on
 * Android, e.g. some Adreno/Mali drivers): without it, WebLLM rejects
 * `MODEL_ID_COMPACT` with a `ShaderF16SupportError` before downloading any
 * weights (see `InferenceEngine.ts`, `classifyInitializationError`).
 */
export const MODEL_ID_COMPACT_F32 = "Llama-3.2-1B-Instruct-q4f32_1-MLC";

/**
 * Maps the pure `modelTier`/`shaderF16Available` decided by `decide()` to
 * the concrete model id to load: `modelTier` picks the size (full/compact),
 * `shaderF16Available` picks the quantization variant (q4f16_1 preferred,
 * q4f32_1 fallback) -- two independent axes, not a single 1-of-4 choice.
 */
export function modelIdForTier(tier: ModelTier, shaderF16Available: boolean): string {
  if (tier === "compact") {
    return shaderF16Available ? MODEL_ID_COMPACT : MODEL_ID_COMPACT_F32;
  }
  return shaderF16Available ? MODEL_ID_FULL : MODEL_ID_FULL_F32;
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
