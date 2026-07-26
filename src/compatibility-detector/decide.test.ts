// Smoke unit tests for `decide()`. The comprehensive property test
// (Property 1) is implemented separately.
// See .kiro/specs/asistente-ia-local/design.md (section "Detector_Compatibilidad").
import { describe, expect, it } from "vitest";
import { decide } from "./decide";

describe("decide", () => {
  it("selects webgpu when available and there is enough memory", () => {
    const result = decide({ webgpuAvailable: true, wasmAvailable: false, memoryGB: 8, isMobileDevice: false });
    expect(result.selectedEngine).toBe("webgpu");
    expect(result.missingCapabilities).toEqual([]);
  });

  it("selects wasm when webgpu is not available but wasm is", () => {
    const result = decide({ webgpuAvailable: false, wasmAvailable: true, memoryGB: null, isMobileDevice: false });
    expect(result.selectedEngine).toBe("wasm");
    expect(result.missingCapabilities).toEqual([]);
  });

  it("selects none with missingCapabilities of memory when memory is insufficient, regardless of webgpu/wasm", () => {
    const result = decide({ webgpuAvailable: true, wasmAvailable: true, memoryGB: 2, isMobileDevice: false });
    expect(result.selectedEngine).toBe("none");
    expect(result.missingCapabilities).toEqual(["memory"]);
  });

  it("selects none with missingCapabilities of webgpu and wasm when neither is available", () => {
    const result = decide({ webgpuAvailable: false, wasmAvailable: false, memoryGB: 8, isMobileDevice: false });
    expect(result.selectedEngine).toBe("none");
    expect(result.missingCapabilities).toEqual(["webgpu", "wasm"]);
  });

  describe("modelTier (Requirement 1: avoid OOM-crashing memory-constrained devices)", () => {
    it("is 'compact' on a mobile device even with memoryGB reported at the maximum tier", () => {
      const result = decide({ webgpuAvailable: true, wasmAvailable: false, memoryGB: 8, isMobileDevice: true });
      expect(result.modelTier).toBe("compact");
    });

    it("is 'full' on a non-mobile device reporting memoryGB at the maximum tier (8)", () => {
      const result = decide({ webgpuAvailable: true, wasmAvailable: false, memoryGB: 8, isMobileDevice: false });
      expect(result.modelTier).toBe("full");
    });

    it("is 'compact' on a non-mobile device reporting memoryGB below 8 (e.g. 4)", () => {
      const result = decide({ webgpuAvailable: true, wasmAvailable: false, memoryGB: 4, isMobileDevice: false });
      expect(result.modelTier).toBe("compact");
    });

    it("is 'full' on a non-mobile device with memoryGB unknown (null, deviceMemory unsupported)", () => {
      const result = decide({ webgpuAvailable: true, wasmAvailable: false, memoryGB: null, isMobileDevice: false });
      expect(result.modelTier).toBe("full");
    });
  });
});
