// App_State: Degraded_Mode messages.
// See .kiro/specs/asistente-ia-local/design.md ("Error Handling") and
// requirements.md (Requirements 1.3, 1.8, 3.5, 8.1, 8.4, 8.5, 10.6).
//
// PURE function that translates the various causes that activate
// Degraded_Mode into the message shown to the user. Separating it from the
// component allows testing the cause -> message mapping without rendering
// anything.

import type { CompatibilityResult } from "../compatibility-detector/decide";

/** Cause that activated Degraded_Mode. */
export type DegradedModeCause =
  | { type: "incompatibility"; missingCapabilities: string[] }
  | { type: "engine_init_failure"; cause: "insufficient_memory" | "other_cause" }
  | { type: "model_download_failure" }
  | { type: "no_connection_initial_load" };

/**
 * Translates a `DegradedModeCause` into the message shown in Degraded_Mode
 * (Requirements 1.3, 1.8, 8.1, 8.4, 8.5, 10.6).
 */
export function degradedModeMessage(cause: DegradedModeCause): string {
  switch (cause.type) {
    case "incompatibility":
      return `Tu dispositivo o navegador no cumple los requisitos mínimos para ejecutar el asistente. Capacidades faltantes: ${cause.missingCapabilities.join(", ")}.`;
    case "engine_init_failure":
      return cause.cause === "insufficient_memory"
        ? "El asistente no pudo inicializarse: el dispositivo no cuenta con memoria suficiente."
        : "El asistente no pudo inicializarse.";
    case "model_download_failure":
      return "La descarga del modelo no pudo completarse.";
    case "no_connection_initial_load":
      return "La carga inicial de la aplicación requiere conexión a internet. Conéctate e intenta de nuevo.";
  }
}

/**
 * Derives the `DegradedModeCause` from a `CompatibilityResult` whose
 * `selectedEngine` is `"none"` (Requirements 1.3, 1.8, 10.6).
 */
export function causeFromIncompatibility(result: CompatibilityResult): DegradedModeCause {
  return { type: "incompatibility", missingCapabilities: result.missingCapabilities };
}
