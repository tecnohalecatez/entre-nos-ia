// Minimal ambient declarations for experimental/non-standard APIs used by
// `detect()` and absent from TypeScript's default DOM types:
// `navigator.gpu` (WebGPU), `navigator.deviceMemory`
// (Device Memory API), and `navigator.userAgentData` (User-Agent Client
// Hints). See .kiro/specs/asistente-ia-local/design.md (section
// "Detector_Compatibilidad") and requirements.md (1.1, 1.7).

/**
 * GPU adapter returned by `GPU.requestAdapter()`. Only `features` is
 * modeled: it's read synchronously to check for optional WebGPU extensions
 * (e.g. `shader-f16`, required by WebLLM's prebuilt catalog) without a
 * second `requestAdapter()` call. See `detect.ts`, `probeWebgpu()`.
 */
interface GPUAdapter {
  /** Set-like collection of supported optional WebGPU extension names. */
  readonly features: { has(name: string): boolean };
}

/** Minimal WebGPU API entry point exposed on `navigator.gpu`. */
interface GPU {
  requestAdapter(): Promise<GPUAdapter | null>;
}

/** Minimal shape of `navigator.userAgentData` (Chromium-only). */
interface NavigatorUaData {
  readonly mobile?: boolean;
}

interface Navigator {
  /** Present only in browsers with WebGPU support (e.g. recent Chrome/Edge). */
  readonly gpu?: GPU;
  /** Present only in browsers with Device Memory API support (e.g. Chromium). Unit: GB. */
  readonly deviceMemory?: number;
  /**
   * Present only in Chromium-based browsers. `mobile` is an exact signal of
   * a mobile-class device, used as the primary mobile-device probe (falls
   * back to a User-Agent string check on browsers that don't expose this,
   * e.g. Safari). See `detect.ts`, `probeIsMobileDevice()`.
   */
  readonly userAgentData?: NavigatorUaData;
}
