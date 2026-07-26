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

/** Result of probing the WebGPU adapter: availability plus its optional-feature support. */
interface WebgpuProbeResult {
  webgpuAvailable: boolean;
  /**
   * Whether the adapter supports the `shader-f16` extension. WebLLM's whole
   * prebuilt model catalog requires it (`required_features: ["shader-f16"]`
   * on every catalog entry); many Android GPU drivers (Adreno, Mali) expose
   * WebGPU but not this optional extension. Read here (synchronously, off
   * the same adapter) instead of a second `requestAdapter()` call, so
   * `configuration.ts`'s `modelIdForTier()` can pick the `q4f32_1` fallback
   * variant instead of failing engine initialization outright.
   */
  shaderF16Available: boolean;
}

/**
 * Probes real WebGPU availability (Requirement 1.1): it is not enough for
 * `navigator.gpu` to exist, it also tries to obtain an adapter via
 * `requestAdapter()` (bounded to 5s) to verify the browser can actually use
 * it. A null adapter, a rejection or a timeout are treated as "not
 * available" (and, consequently, `shader-f16` as unsupported).
 */
async function probeWebgpu(): Promise<WebgpuProbeResult> {
  const gpu = navigator.gpu;
  if (gpu === undefined) {
    return { webgpuAvailable: false, shaderF16Available: false };
  }

  const adapter = await withTimeout(gpu.requestAdapter().catch(() => null), PROBE_TIMEOUT_MS, null);
  if (adapter === null) {
    return { webgpuAvailable: false, shaderF16Available: false };
  }
  return { webgpuAvailable: true, shaderF16Available: adapter.features.has("shader-f16") };
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

/** Matches common mobile-browser User-Agent tokens (Android/iOS/other). */
const MOBILE_USER_AGENT_PATTERN = /Android|iPhone|iPad|iPod|Mobile/i;

/**
 * Probes whether the current device is mobile-class, used to decide
 * `modelTier` in `decide()` (a full-size model reliably OOM-crashes phones,
 * see `configuration.ts`). Prefers `navigator.userAgentData.mobile`
 * (Chromium, exact signal); falls back to a User-Agent string check for
 * browsers that don't expose User-Agent Client Hints (e.g. Safari/iOS,
 * which also lacks `navigator.deviceMemory`).
 */
async function probeIsMobileDevice(): Promise<boolean> {
  const mobile = navigator.userAgentData?.mobile ?? MOBILE_USER_AGENT_PATTERN.test(navigator.userAgent);
  return withTimeout(Promise.resolve(mobile), PROBE_TIMEOUT_MS, false);
}

/**
 * Runs the real browser probes (environment I/O, with a 5s timeout per
 * probe) required by `decide()`. See Requirements 1.1, 1.2, 1.7.
 */
export async function detect(): Promise<DecideInput> {
  const [{ webgpuAvailable, shaderF16Available }, wasmAvailable, memoryGB, isMobileDevice] = await Promise.all([
    probeWebgpu(),
    probeWasm(),
    probeMemoryGB(),
    probeIsMobileDevice(),
  ]);

  return { webgpuAvailable, wasmAvailable, memoryGB, isMobileDevice, shaderF16Available };
}
