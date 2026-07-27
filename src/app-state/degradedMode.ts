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
  | {
      type: "engine_init_failure";
      cause:
        | "insufficient_memory"
        | "network_error"
        | "unsupported_gpu_feature"
        | "unsupported_gpu_limits"
        | "gpu_unavailable"
        | "other_cause";
      /**
       * Raw underlying error description (`${name}: ${message}`, truncated
       * -- see `describeErrorDetail()` in `AppStateProvider.tsx`), shown in
       * a collapsed "Detalles técnicos" section (`App.tsx`) so a device
       * without accessible devtools (a phone, a tablet) can still report
       * the real cause instead of only the generic Spanish message below.
       * Never transmitted anywhere (Requisito 6): it's the same text
       * already printed to `console.error` in `AppStateProvider.tsx`, just
       * also rendered locally, on-device.
       */
      detail?: string;
    }
  | { type: "model_download_failure" }
  | { type: "no_connection_initial_load" }
  | {
      /**
       * The tab was killed (crashed, most likely an OOM kill by the OS/
       * browser) at least `LOAD_CRASH_THRESHOLD` (`AppStateProvider.tsx`)
       * times in a row while `InferenceEngine.initialize()` was in flight
       * (`sessionDiagnostics.ts`'s `recordLoadCrash()`) -- observed on a
       * phone as a silent, invisible "loads then reloads" loop with no
       * error ever shown (a hard process crash never runs any of this
       * app's `catch` blocks). Once detected, the boot sequence stops
       * retrying on its own and surfaces this instead, with a manual retry
       * (`App.tsx`) -- an infinite silent reload is strictly worse UX than
       * a clear message asking the user to try again.
       */
      type: "repeated_load_crash";
      attempts: number;
    };

/**
 * Human-readable label for each raw `missingCapabilities` token produced by
 * `decide()`, used to build a natural-sounding incompatibility message
 * instead of concatenating the raw internal tokens (which are plain
 * lowercase English identifiers, not meant for display).
 */
const CAPABILITY_LABELS: Record<string, string> = {
  webgpu: "WebGPU",
  wasm: "WebAssembly",
  memory: "memoria suficiente",
};

function describeMissingCapabilities(missingCapabilities: string[]): string {
  return missingCapabilities.map((capability) => CAPABILITY_LABELS[capability] ?? capability).join(", ");
}

/** Message for each possible `engine_init_failure` sub-cause. */
function engineInitFailureMessage(
  cause:
    | "insufficient_memory"
    | "network_error"
    | "unsupported_gpu_feature"
    | "unsupported_gpu_limits"
    | "gpu_unavailable"
    | "other_cause",
): string {
  if (cause === "insufficient_memory") {
    return "El asistente no pudo inicializarse: el dispositivo no cuenta con memoria suficiente.";
  }
  if (cause === "network_error") {
    return "No se pudo descargar el modelo de IA. Verificá tu conexión a internet; si usás un bloqueador de contenido, VPN o un modo de privacidad estricto (por ejemplo, los Shields de Brave), probá desactivarlo para este sitio e intentá de nuevo.";
  }
  if (cause === "unsupported_gpu_feature") {
    // Not something reloading fixes (unlike the generic message below):
    // it's a fixed capability of this device's GPU/driver.
    return "El asistente no pudo inicializarse porque la GPU de este dispositivo no soporta una función gráfica necesaria (shader-f16), algo común en ciertos modelos de celular. No se soluciona recargando la página; probá con otro dispositivo o navegador.";
  }
  if (cause === "unsupported_gpu_limits") {
    // Also a fixed device capability, not something a reload fixes -- see
    // `classifyInitializationError()`'s `GPU_LIMIT_PATTERNS` comment
    // (`InferenceEngine.ts`) for the underlying WebLLM error this maps.
    return "El asistente no pudo inicializarse porque la GPU o el controlador gráfico de este dispositivo no cumple los límites mínimos que necesita el motor de IA. Es una limitación fija de este equipo: no se soluciona recargando la página, desactivando extensiones ni cambiando la configuración de privacidad. Podés intentar con otro dispositivo o navegador.";
  }
  if (cause === "gpu_unavailable") {
    // Unlike unsupported_gpu_feature, this comes from a second, independent
    // WebGPU probe (WebLLM's own) failing after ours already succeeded --
    // possibly transient (a flaky driver/context loss), so reloading is a
    // reasonable suggestion here, unlike the other device-capability causes.
    return "El asistente no pudo inicializarse: WebGPU dejó de estar disponible justo al momento de cargar el modelo. Probá recargar la página; si el problema persiste, es probable que se deba a una limitación del navegador o la GPU de este dispositivo.";
  }
  return "El asistente no pudo inicializarse. Esto puede deberse a que tu navegador no sea completamente compatible con la tecnología requerida, a una extensión o configuración de privacidad bloqueando la descarga del modelo, o a un problema temporal. Probá recargar la página; si el problema persiste, verificá que tu navegador soporte WebGPU o WebAssembly y que no tengas bloqueadores de contenido activos para este sitio.";
}

/**
 * Translates a `DegradedModeCause` into the message shown in Degraded_Mode
 * (Requirements 1.3, 1.8, 8.1, 8.4, 8.5, 10.6).
 */
export function degradedModeMessage(cause: DegradedModeCause): string {
  switch (cause.type) {
    case "incompatibility":
      return `Tu dispositivo o navegador no cumple los requisitos mínimos para ejecutar el asistente. Te falta: ${describeMissingCapabilities(cause.missingCapabilities)}.`;
    case "engine_init_failure":
      return engineInitFailureMessage(cause.cause);
    case "model_download_failure":
      return "La descarga del modelo no pudo completarse.";
    case "no_connection_initial_load":
      return "La carga inicial de la aplicación requiere conexión a internet. Conéctate e intenta de nuevo.";
    case "repeated_load_crash":
      return `El dispositivo se quedó sin memoria ${String(cause.attempts)} veces seguidas intentando cargar el modelo de IA. Es probable que este navegador o dispositivo no tenga memoria suficiente para ejecutarlo localmente.`;
  }
}

/**
 * Derives the `DegradedModeCause` from a `CompatibilityResult` whose
 * `selectedEngine` is `"none"` (Requirements 1.3, 1.8, 10.6).
 */
export function causeFromIncompatibility(result: CompatibilityResult): DegradedModeCause {
  return { type: "incompatibility", missingCapabilities: result.missingCapabilities };
}
