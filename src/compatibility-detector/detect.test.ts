// Tests for `detect()`: smoke (basic cases) and integration (mocks of
// navigator.gpu/WebAssembly/deviceMemory and 5s per-probe timeout
// behavior). See .kiro/specs/asistente-ia-local/design.md (section
// "Detector_Compatibilidad") and requirements.md (1.1, 1.2, 1.7).
import { afterEach, describe, expect, it, vi } from "vitest";
import { detect } from "./detect";

describe("detect", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("reports webgpuAvailable true when requestAdapter resolves an adapter", async () => {
    vi.stubGlobal("navigator", {
      gpu: { requestAdapter: () => Promise.resolve({}) },
      deviceMemory: 8,
    });

    const result = await detect();

    expect(result.webgpuAvailable).toBe(true);
    expect(result.wasmAvailable).toBe(true);
    expect(result.memoryGB).toBe(8);
  });

  it("reports webgpuAvailable false and memoryGB null when the browser does not expose those APIs", async () => {
    vi.stubGlobal("navigator", { gpu: undefined, deviceMemory: undefined });

    const result = await detect();

    expect(result.webgpuAvailable).toBe(false);
    expect(result.memoryGB).toBeNull();
  });

  describe("WebGPU probe (Requirement 1.1)", () => {
    it("reports webgpuAvailable false when requestAdapter rejects", async () => {
      vi.stubGlobal("navigator", {
        gpu: { requestAdapter: () => Promise.reject(new Error("no adapter")) },
        deviceMemory: 8,
      });

      const result = await detect();

      expect(result.webgpuAvailable).toBe(false);
    });

    it("reports webgpuAvailable false when requestAdapter resolves null", async () => {
      vi.stubGlobal("navigator", {
        gpu: { requestAdapter: () => Promise.resolve(null) },
        deviceMemory: 8,
      });

      const result = await detect();

      expect(result.webgpuAvailable).toBe(false);
    });

    it("reports webgpuAvailable false after the 5s timeout when requestAdapter never resolves", async () => {
      vi.useFakeTimers();
      vi.stubGlobal("navigator", {
        // Promise that never resolves nor rejects: simulates a hung probe.
        gpu: { requestAdapter: () => new Promise<never>(() => undefined) },
        deviceMemory: 8,
      });

      const resultPromise = detect();
      await vi.advanceTimersByTimeAsync(5000);
      const result = await resultPromise;

      expect(result.webgpuAvailable).toBe(false);
    });

    it("reports webgpuAvailable false immediately (without waiting for the timeout) when navigator.gpu does not exist", async () => {
      vi.useFakeTimers();
      vi.stubGlobal("navigator", { gpu: undefined, deviceMemory: 8 });

      const result = await detect();

      expect(result.webgpuAvailable).toBe(false);
    });
  });

  describe("WebAssembly probe (Requirement 1.2)", () => {
    it("reports wasmAvailable true when WebAssembly is available in the environment", async () => {
      vi.stubGlobal("navigator", { gpu: undefined, deviceMemory: 8 });

      const result = await detect();

      expect(result.wasmAvailable).toBe(true);
    });
  });

  describe("memory probe (Requirement 1.7)", () => {
    it("reports memoryGB with the numeric value exposed by navigator.deviceMemory", async () => {
      vi.stubGlobal("navigator", { gpu: undefined, deviceMemory: 16 });

      const result = await detect();

      expect(result.memoryGB).toBe(16);
    });

    it("reports memoryGB null when navigator.deviceMemory is not exposed", async () => {
      vi.stubGlobal("navigator", { gpu: undefined, deviceMemory: undefined });

      const result = await detect();

      expect(result.memoryGB).toBeNull();
    });
  });
});
