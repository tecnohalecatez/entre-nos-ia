// ActiveEngineIndicator: presentation component of the Chat_Interface (task 19.1).
//
// See .kiro/specs/asistente-ia-local/design.md ("Interfaz_Chat",
// "Detector_Compatibilidad") and requirements.md (1.6).
//
// Responsibility: persistently show the active inference mechanism (WebGPU
// or WASM) while the Chat_Interface is visible (1.6). The active mechanism
// is derived from `compatibility.selectedEngine` (`AppStateContext`,
// computed by `decide()`):
// - `"webgpu"` -> shows "WebGPU".
// - `"wasm"` -> shows "WebAssembly".
// - `null` (boot hasn't determined compatibility yet) or `"none"`
//   (Degraded_Mode: no engine is actually active) -> no indicator is
//   rendered, since in both cases there's no active inference mechanism to
//   announce.

import { useAppState } from "../app-state/useAppState";
import "./ActiveEngineIndicator.css";

const ENGINE_LABELS: Record<"webgpu" | "wasm", string> = {
  webgpu: "WebGPU",
  wasm: "WebAssembly",
};

export function ActiveEngineIndicator() {
  const { compatibility } = useAppState();

  const engine = compatibility?.selectedEngine;

  if (engine !== "webgpu" && engine !== "wasm") {
    return null;
  }

  return (
    <span className="active-engine-indicator" aria-label="Mecanismo de inferencia activo">
      {ENGINE_LABELS[engine]}
    </span>
  );
}
