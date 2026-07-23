// Smoke unit tests for `decide()`. The comprehensive property test
// (Property 1) is implemented separately.
// See .kiro/specs/asistente-ia-local/design.md (section "Detector_Compatibilidad").
import { describe, expect, it } from "vitest";
import { decide } from "./decide";

describe("decide", () => {
  it("selects webgpu when available and there is enough memory", () => {
    const result = decide({ webgpuAvailable: true, wasmAvailable: false, memoryGB: 8 });
    expect(result.selectedEngine).toBe("webgpu");
    expect(result.missingCapabilities).toEqual([]);
  });

  it("selects wasm when webgpu is not available but wasm is", () => {
    const result = decide({ webgpuAvailable: false, wasmAvailable: true, memoryGB: null });
    expect(result.selectedEngine).toBe("wasm");
    expect(result.missingCapabilities).toEqual([]);
  });

  it("selects none with missingCapabilities of memory when memory is insufficient, regardless of webgpu/wasm", () => {
    const result = decide({ webgpuAvailable: true, wasmAvailable: true, memoryGB: 2 });
    expect(result.selectedEngine).toBe("none");
    expect(result.missingCapabilities).toEqual(["memory"]);
  });

  it("selects none with missingCapabilities of webgpu and wasm when neither is available", () => {
    const result = decide({ webgpuAvailable: false, wasmAvailable: false, memoryGB: 8 });
    expect(result.selectedEngine).toBe("none");
    expect(result.missingCapabilities).toEqual(["webgpu", "wasm"]);
  });
});
