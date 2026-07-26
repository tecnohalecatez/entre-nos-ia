// Compatibility_Detector: pure function that decides the inference engine.
// See .kiro/specs/asistente-ia-local/design.md (section "Detector_Compatibilidad")
// for design details and .kiro/specs/asistente-ia-local/requirements.md
// (1.3, 1.4, 1.5, 1.7, 1.8, 10.6).

/** Selected inference engine, or "none" in degraded mode. */
export type SelectedEngine = "webgpu" | "wasm" | "none";

/**
 * Which model size to load: "full" (`MODEL_ID_FULL`, ~2.26 GB VRAM) on
 * desktop-class devices, "compact" (`MODEL_ID_COMPACT`, ~0.88 GB VRAM) on
 * memory-constrained devices such as phones. See `configuration.ts`.
 */
export type ModelTier = "full" | "compact";

/** Environment probe input (already performed by `detect()`, I/O). */
export interface DecideInput {
  webgpuAvailable: boolean;
  wasmAvailable: boolean;
  /** null if the browser does not expose navigator.deviceMemory */
  memoryGB: number | null;
  /** Best-effort mobile-device signal (Requirement 1, model tier). See `detect.ts`. */
  isMobileDevice: boolean;
  /**
   * Whether the WebGPU adapter supports the `shader-f16` extension, required
   * by WebLLM's `q4f16_1`-quantized models. See `detect.ts`, `probeWebgpu()`.
   */
  shaderF16Available: boolean;
}

/** Pure, serializable result of the compatibility decision. */
export interface CompatibilityResult {
  webgpuAvailable: boolean;
  wasmAvailable: boolean;
  memoryGB: number | null;
  selectedEngine: SelectedEngine;
  /** e.g. ["webgpu", "wasm"] or ["memory"] */
  missingCapabilities: string[];
  /** Which model size `AppStateProvider` should load; only meaningful when `selectedEngine !== "none"`. */
  modelTier: ModelTier;
  /**
   * Pass-through of the input probe, unchanged: NOT used to decide
   * `selectedEngine`/`missingCapabilities` (missing `shader-f16` isn't a
   * blocking incompatibility, `configuration.ts`'s `modelIdForTier()` has a
   * `q4f32_1` fallback that doesn't require it). Kept here, alongside
   * `modelTier`, so `AppStateProvider` has everything it needs to resolve
   * the concrete model id from a single `CompatibilityResult`.
   */
  shaderF16Available: boolean;
}

const MIN_MEMORY_GB = 4;

/**
 * Minimum reported `memoryGB` to consider the full-size model (~2.26 GB
 * VRAM) safe to load. `navigator.deviceMemory` is quantized to powers of 2
 * and capped at 8 (per spec), so a typical phone reports the same 4 or 8 GB
 * as a modest laptop -- "8" is the only value that reliably means "this
 * device reports the maximum tier", the sole safe margin for a ~2.26 GB
 * model. Independent of `isMobileDevice`: either signal alone is enough to
 * fall back to the compact model.
 */
const MIN_MEMORY_GB_FULL_MODEL = 8;

/**
 * PURE function subject to PBT (Property 1): given the environment probe
 * results, decides which inference engine to use (or degraded mode), the
 * missing capabilities that explain that decision, and which model size is
 * safe to load.
 *
 * Rules (derived from 1.3, 1.4, 1.5, 1.7, 1.8, 10.6), evaluated in this
 * precedence order:
 * 1. If `memoryGB !== null && memoryGB < 4` -> `selectedEngine = "none"`,
 *    `missingCapabilities` includes only `"memory"`.
 * 2. If `webgpuAvailable` -> `selectedEngine = "webgpu"`.
 * 3. If not `webgpuAvailable` but `wasmAvailable` -> `selectedEngine = "wasm"`.
 * 4. If neither is available -> `selectedEngine = "none"`,
 *    `missingCapabilities` includes `"webgpu"` and `"wasm"`.
 *
 * Independently of the above, `modelTier` is `"compact"` when
 * `isMobileDevice` is true or when `memoryGB` is below
 * `MIN_MEMORY_GB_FULL_MODEL`; otherwise `"full"`. This doesn't affect
 * `selectedEngine`/`missingCapabilities` precedence: a device can be
 * incompatible (`selectedEngine === "none"`) with any `modelTier` value,
 * which is simply unused in that case (no model is loaded).
 */
export function decide(input: DecideInput): CompatibilityResult {
  const { webgpuAvailable, wasmAvailable, memoryGB, isMobileDevice, shaderF16Available } = input;

  const insufficientMemory = memoryGB !== null && memoryGB < MIN_MEMORY_GB;

  let selectedEngine: SelectedEngine;
  let missingCapabilities: string[];

  if (insufficientMemory) {
    selectedEngine = "none";
    missingCapabilities = ["memory"];
  } else if (webgpuAvailable) {
    selectedEngine = "webgpu";
    missingCapabilities = [];
  } else if (wasmAvailable) {
    selectedEngine = "wasm";
    missingCapabilities = [];
  } else {
    selectedEngine = "none";
    missingCapabilities = ["webgpu", "wasm"];
  }

  const modelTier: ModelTier =
    isMobileDevice || (memoryGB !== null && memoryGB < MIN_MEMORY_GB_FULL_MODEL) ? "compact" : "full";

  return {
    webgpuAvailable,
    wasmAvailable,
    memoryGB,
    selectedEngine,
    missingCapabilities,
    modelTier,
    shaderF16Available,
  };
}
