// Compatibility_Detector: real environment probes (I/O), with a 5s timeout
// per probe. See .kiro/specs/asistente-ia-local/design.md (section
// "Detector_Compatibilidad") and requirements.md (1.1, 1.2, 1.7).
//
// This function is intentionally NOT pure: it reads `navigator.gpu`,
// `WebAssembly` and `navigator.deviceMemory` from the real environment. The
// decision of which engine to use from these probes lives in `decide()`
// (pure function, subject to PBT in Property 1).

import type { DecideInput } from "./decide";

/** Maximum verification time per probe, per 1.1, 1.2 and 1.7. */
const PROBE_TIMEOUT_MS = 5000;

/**
 * Runs `promise` and races it against a timeout of `ms` milliseconds.
 * If the timeout wins, resolves with `timeoutValue` instead of rejecting,
 * so that a slow probe is treated as "not available" instead of
 * propagating an error.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, timeoutValue: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => {
      resolve(timeoutValue);
    }, ms);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(timeoutValue);
      },
    );
  });
}

/**
 * Probes real WebGPU availability (Requirement 1.1): it is not enough for
 * `navigator.gpu` to exist, it also tries to obtain an adapter via
 * `requestAdapter()` (bounded to 5s) to verify the browser can actually use
 * it. A null adapter, a rejection or a timeout are treated as "not
 * available".
 */
async function probeWebgpu(): Promise<boolean> {
  const gpu = navigator.gpu;
  if (gpu === undefined) {
    return false;
  }

  const adapter = await withTimeout(gpu.requestAdapter().catch(() => null), PROBE_TIMEOUT_MS, null);
  return adapter !== null;
}

/**
 * Probes WebAssembly availability (Requirement 1.2). The global property
 * check is synchronous; it is wrapped in the same timeout pattern for
 * uniformity with the other probes.
 */
async function probeWasm(): Promise<boolean> {
  const available = typeof WebAssembly !== "undefined";
  return withTimeout(Promise.resolve(available), PROBE_TIMEOUT_MS, false);
}

/**
 * Probes the device's available memory via `navigator.deviceMemory`
 * (Requirement 1.7). Returns `null` if the browser does not expose this
 * API.
 */
async function probeMemoryGB(): Promise<number | null> {
  const memoryGB = navigator.deviceMemory ?? null;
  return withTimeout(Promise.resolve(memoryGB), PROBE_TIMEOUT_MS, null);
}

/**
 * Runs the real browser probes (environment I/O, with a 5s timeout per
 * probe) required by `decide()`. See Requirements 1.1, 1.2, 1.7.
 */
export async function detect(): Promise<DecideInput> {
  const [webgpuAvailable, wasmAvailable, memoryGB] = await Promise.all([
    probeWebgpu(),
    probeWasm(),
    probeMemoryGB(),
  ]);

  return { webgpuAvailable, wasmAvailable, memoryGB };
}
