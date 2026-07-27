// App_State: translates WebLLM's raw `InitializationProgressReport` (English,
// implementation-specific text meant for its own console logging) into a
// small domain model the UI can render without parsing prose (Requisito
// 2.2).
//
// WebLLM reports FOUR independent phases while loading a model, each with
// its own 0->1 `progress` that RESETS between phases (verified by reading
// `node_modules/@mlc-ai/web-llm/lib/index.js`, the `fetchTensorCacheInternal`
// and `reload` methods): there is no single combined "total" progress value
// coming from the SDK, so this module intentionally exposes per-phase
// progress instead of inventing a global percentage from fixed phase
// weights.
//
//   1. "Start to fetch params"
//   2. "Fetching param cache[6/23]: 512MB fetched. 62% completed, 14 secs elapsed. ..."
//   3. "Loading model from cache[6/23]: 512MB loaded. 62% completed, 14 secs elapsed."
//   4. "Loading GPU shader modules[80/120]: 66% completed, 3 secs elapsed."
//   5. "Finish loading on WebGPU - <gpu>" (progress: 1)
//
// The phase is derived from the REPORT'S OWN `text` prefix rather than from
// call order, so an unrecognized future WebLLM message degrades to
// `"starting"` (loses phase-specific detail, never throws or shows stale
// data).

import type { InitializationProgressReport } from "../inference-engine/InferenceEngine";
import { calculateProgress } from "../model-download-manager/calculateProgress";

export type ModelLoadPhase = "starting" | "downloading" | "loading_weights" | "compiling_shaders" | "ready";

export interface ModelLoadProgress {
  phase: ModelLoadPhase;
  /** 0-100, WITHIN the current phase only (see module note: phases don't share a scale). */
  percentage: number;
  /** The "[6/23]" shard/module counter WebLLM reports for this phase, or `null` when absent. */
  step: { current: number; total: number } | null;
  /** Megabytes transferred so far, parsed from `text`, or `null` when the phase doesn't report it. */
  megabytes: number | null;
  secondsElapsed: number;
}

const STEP_PATTERN = /\[(\d+)\/(\d+)\]/;
const MEGABYTES_PATTERN = /(\d+(?:\.\d+)?)MB (?:fetched|loaded)/;

function phaseFromText(text: string): ModelLoadPhase {
  if (text.startsWith("Fetching param cache[")) {
    return "downloading";
  }
  if (text.startsWith("Loading model from cache[")) {
    return "loading_weights";
  }
  if (text.startsWith("Loading GPU shader modules[")) {
    return "compiling_shaders";
  }
  if (text.startsWith("Finish loading on ")) {
    return "ready";
  }
  return "starting";
}

function parseStep(text: string): { current: number; total: number } | null {
  const match = STEP_PATTERN.exec(text);
  if (match === null) {
    return null;
  }
  return { current: Number(match[1]), total: Number(match[2]) };
}

function parseMegabytes(text: string): number | null {
  const match = MEGABYTES_PATTERN.exec(text);
  return match === null ? null : Number(match[1]);
}

/**
 * Translates a single WebLLM `InitializationProgressReport` into
 * `ModelLoadProgress`. PURE: same input always yields the same output, no
 * dependency on prior reports.
 */
export function parseModelLoadProgress(report: InitializationProgressReport): ModelLoadProgress {
  return {
    phase: phaseFromText(report.text),
    percentage: calculateProgress(report.progress, 1),
    step: parseStep(report.text),
    megabytes: parseMegabytes(report.text),
    secondsElapsed: report.timeElapsed,
  };
}

/** Spanish label for a `ModelLoadPhase`, shown in the loading screen. */
export function modelLoadPhaseLabel(phase: ModelLoadPhase): string {
  switch (phase) {
    case "starting":
      return "Preparando la descarga…";
    case "downloading":
      return "Descargando el modelo";
    case "loading_weights":
      return "Cargando los pesos en la GPU";
    case "compiling_shaders":
      return "Compilando los shaders de la GPU";
    case "ready":
      return "Listo";
  }
}
