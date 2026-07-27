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
 * Model used on desktop-class devices (`modelTier === "full"`) whose WebGPU
 * adapter supports `shader-f16` (`shaderF16Available === true`, the common
 * case). `vram_required_MB: 879.04` per WebLLM's catalog (~0.88 GB).
 *
 * Was `Llama-3.2-3B-Instruct-q4f16_1-MLC` (~2.26 GB) until this was lowered
 * to the same model as `MODEL_ID_COMPACT`, to reduce the app's memory
 * footprint on desktop too (-61% VRAM). `MODEL_ID_FULL`/`MODEL_ID_COMPACT`
 * are kept as separate constants on purpose, even though they currently
 * hold the same value: `modelTier` still has a real effect
 * (`contextWindowSizeForTier()` -- 2048 on `compact`, 4096 on `full`), and
 * splitting the two model sizes back apart later is a two-line change
 * instead of a refactor.
 */
export const MODEL_ID_FULL = "Llama-3.2-1B-Instruct-q4f16_1-MLC";

/**
 * `q4f32_1` fallback for `MODEL_ID_FULL`, used when `shaderF16Available` is
 * false: doesn't require the `shader-f16` WebGPU extension (`required_features`
 * is absent from this catalog entry). Heavier than `MODEL_ID_FULL`
 * (`vram_required_MB: 1128.82`, ~1.13 GB) since f32 weights take more space
 * than f16.
 */
export const MODEL_ID_FULL_F32 = "Llama-3.2-1B-Instruct-q4f32_1-MLC";

/**
 * Model used on memory-constrained devices such as phones
 * (`modelTier === "compact"`) whose adapter supports `shader-f16`. Same id
 * as `MODEL_ID_FULL` (see its doc comment for why the constants stay
 * separate). `vram_required_MB: 879.04` per WebLLM's catalog (~0.88 GB).
 *
 * Originally introduced to avoid the renderer OOM-crash a larger model
 * caused on phones: `navigator.deviceMemory` reports device RAM quantized
 * to powers of 2 and capped at 8, so a typical phone reads the same 4-8 GB
 * as a modest laptop and would otherwise pass the Degraded_Mode memory gate
 * (`decide.ts`, `MIN_MEMORY_GB`) while still being unable to actually hold
 * a larger model's weights in the renderer process. Now that `MODEL_ID_FULL`
 * is the same size, `modelTier`'s only remaining effect is the
 * `context_window_size` override (`contextWindowSizeForTier()`).
 */
export const MODEL_ID_COMPACT = "Llama-3.2-1B-Instruct-q4f16_1-MLC";

/**
 * `q4f32_1` fallback for `MODEL_ID_COMPACT`, used when `shaderF16Available`
 * is false: `vram_required_MB: 1128.82` (~1.13 GB) per WebLLM's catalog.
 * This is the variant that fixes phones whose GPU driver exposes WebGPU but
 * not the `shader-f16` extension (common on Android, e.g. some Adreno/Mali
 * drivers): without it, WebLLM rejects `MODEL_ID_COMPACT` with a
 * `ShaderF16SupportError` before downloading any weights (see
 * `InferenceEngine.ts`, `classifyInitializationError`).
 */
export const MODEL_ID_COMPACT_F32 = "Llama-3.2-1B-Instruct-q4f32_1-MLC";

/**
 * User-facing description of a model variant, shown in the loading screen
 * (Requisito 2.2) so a real device makes it visible which of the four
 * catalog entries was actually selected -- useful for the still-open
 * Android/iOS diagnosis, which currently has no other way to observe this.
 */
export interface ModelDescriptor {
  id: string;
  /** Short human name, e.g. "Llama 3.2 1B" (no quantization suffix -- that's an implementation detail). */
  displayName: string;
  /** `vram_required_MB` from WebLLM's catalog for this exact `id`. */
  approximateSizeMb: number;
}

const MODEL_DESCRIPTORS: Record<ModelTier, Record<"f16" | "f32", ModelDescriptor>> = {
  full: {
    f16: { id: MODEL_ID_FULL, displayName: "Llama 3.2 1B", approximateSizeMb: 879.04 },
    f32: { id: MODEL_ID_FULL_F32, displayName: "Llama 3.2 1B", approximateSizeMb: 1128.82 },
  },
  compact: {
    f16: { id: MODEL_ID_COMPACT, displayName: "Llama 3.2 1B", approximateSizeMb: 879.04 },
    f32: { id: MODEL_ID_COMPACT_F32, displayName: "Llama 3.2 1B", approximateSizeMb: 1128.82 },
  },
};

/**
 * Same 2x2 matrix as `modelIdForTier()`, returned as a full descriptor
 * instead of just the id -- single source of truth for both (`modelIdForTier`
 * delegates here) so the id and its displayed name/size can never drift
 * apart.
 */
export function modelDescriptorForTier(tier: ModelTier, shaderF16Available: boolean): ModelDescriptor {
  return MODEL_DESCRIPTORS[tier][shaderF16Available ? "f16" : "f32"];
}

/**
 * Maps the pure `modelTier`/`shaderF16Available` decided by `decide()` to
 * the concrete model id to load: `modelTier` picks the size (full/compact),
 * `shaderF16Available` picks the quantization variant (q4f16_1 preferred,
 * q4f32_1 fallback) -- two independent axes, not a single 1-of-4 choice.
 */
export function modelIdForTier(tier: ModelTier, shaderF16Available: boolean): string {
  return modelDescriptorForTier(tier, shaderF16Available).id;
}

/**
 * Reduced `context_window_size` for `modelTier === "compact"` (mobile
 * devices), overriding the model's own default (4096, per every Llama-3.2
 * catalog entry's `overrides.context_window_size`). Roughly halves the
 * KV-cache's memory footprint during generation.
 *
 * Best-effort mitigation, NOT a confirmed fix: browsers don't expose a way
 * to read a mobile device's actual available memory during generation (iOS
 * Safari doesn't expose ANY memory signal at all, see `decide.ts`'s
 * `MIN_MEMORY_GB_FULL_MODEL` comment), so this is a bounded, low-risk step
 * down rather than a measured response to an observed constraint.
 */
export const CONTEXT_WINDOW_SIZE_COMPACT = 2048;

/**
 * Catalog default `context_window_size` for the `full` tier -- every
 * Llama-3.2 entry in WebLLM's catalog declares this value. Not passed to
 * `InferenceEngine` (`contextWindowSizeForTier()` returns `undefined` for
 * `full`, so the model's own default applies unchanged); exposed only so
 * the loading screen (`ModelLoadProgressIndicator`) can display the actual
 * number instead of hardcoding it.
 */
export const CONTEXT_WINDOW_SIZE_DEFAULT = 4096;

/**
 * Maps `modelTier` to the `context_window_size` override `InferenceEngine`
 * should apply, or `undefined` to keep the model's own default unchanged
 * (`modelTier === "full"`: desktop-class devices aren't the ones observed
 * crashing during generation). This is now the ONLY behavioral difference
 * between tiers, since `MODEL_ID_FULL`/`MODEL_ID_COMPACT` load the same
 * model (see their doc comments above).
 */
export function contextWindowSizeForTier(tier: ModelTier): number | undefined {
  return tier === "compact" ? CONTEXT_WINDOW_SIZE_COMPACT : undefined;
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
