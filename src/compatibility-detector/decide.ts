// Compatibility_Detector: pure function that decides the inference engine.
// See .kiro/specs/asistente-ia-local/design.md (section "Detector_Compatibilidad")
// for design details and .kiro/specs/asistente-ia-local/requirements.md
// (1.3, 1.4, 1.5, 1.7, 1.8, 10.6).

/** Selected inference engine, or "none" in degraded mode. */
export type SelectedEngine = "webgpu" | "wasm" | "none";

/** Environment probe input (already performed by `detect()`, I/O). */
export interface DecideInput {
  webgpuAvailable: boolean;
  wasmAvailable: boolean;
  /** null if the browser does not expose navigator.deviceMemory */
  memoryGB: number | null;
}

/** Pure, serializable result of the compatibility decision. */
export interface CompatibilityResult {
  webgpuAvailable: boolean;
  wasmAvailable: boolean;
  memoryGB: number | null;
  selectedEngine: SelectedEngine;
  /** e.g. ["webgpu", "wasm"] or ["memory"] */
  missingCapabilities: string[];
}

const MIN_MEMORY_GB = 4;

/**
 * PURE function subject to PBT (Property 1): given the environment probe
 * results, decides which inference engine to use (or degraded mode) and
 * the missing capabilities that explain that decision.
 *
 * Rules (derived from 1.3, 1.4, 1.5, 1.7, 1.8, 10.6), evaluated in this
 * precedence order:
 * 1. If `memoryGB !== null && memoryGB < 4` -> `selectedEngine = "none"`,
 *    `missingCapabilities` includes only `"memory"`.
 * 2. If `webgpuAvailable` -> `selectedEngine = "webgpu"`.
 * 3. If not `webgpuAvailable` but `wasmAvailable` -> `selectedEngine = "wasm"`.
 * 4. If neither is available -> `selectedEngine = "none"`,
 *    `missingCapabilities` includes `"webgpu"` and `"wasm"`.
 */
export function decide(input: DecideInput): CompatibilityResult {
  const { webgpuAvailable, wasmAvailable, memoryGB } = input;

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

  return {
    webgpuAvailable,
    wasmAvailable,
    memoryGB,
    selectedEngine,
    missingCapabilities,
  };
}
