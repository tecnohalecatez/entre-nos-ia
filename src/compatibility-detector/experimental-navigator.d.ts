// Minimal ambient declarations for experimental/non-standard APIs used by
// `detect()` and absent from TypeScript's default DOM types:
// `navigator.gpu` (WebGPU) and `navigator.deviceMemory`
// (Device Memory API). See .kiro/specs/asistente-ia-local/design.md
// (section "Detector_Compatibilidad") and requirements.md (1.1, 1.7).

/** GPU adapter returned by `GPU.requestAdapter()`. Shape not relevant here. */
type GPUAdapter = Readonly<Record<string, unknown>>;

/** Minimal WebGPU API entry point exposed on `navigator.gpu`. */
interface GPU {
  requestAdapter(): Promise<GPUAdapter | null>;
}

interface Navigator {
  /** Present only in browsers with WebGPU support (e.g. recent Chrome/Edge). */
  readonly gpu?: GPU;
  /** Present only in browsers with Device Memory API support (e.g. Chromium). Unit: GB. */
  readonly deviceMemory?: number;
}
