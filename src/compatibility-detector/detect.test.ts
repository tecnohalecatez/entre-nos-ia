// Tests for `detect()`: smoke (basic cases) and integration (mocks of
// navigator.gpu/WebAssembly/deviceMemory and 5s per-probe timeout
// behavior). See .kiro/specs/asistente-ia-local/design.md (section
// "Detector_Compatibilidad") and requirements.md (1.1, 1.2, 1.7).
import { afterEach, describe, expect, it, vi } from "vitest";
import { detect } from "./detect";

/** Fake `GPUAdapter`, mirroring the real WebGPU shape `probeWebgpu()` reads (`adapter.features.has(...)`). */
function createFakeAdapter(supportedFeatures: string[] = []): { features: { has(name: string): boolean } } {
  return { features: { has: (name: string) => supportedFeatures.includes(name) } };
}

describe("detect", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("reports webgpuAvailable true when requestAdapter resolves an adapter", async () => {
    vi.stubGlobal("navigator", {
      gpu: { requestAdapter: () => Promise.resolve(createFakeAdapter(["shader-f16"])) },
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

  describe("shader-f16 probe (Requirement 1, model quantization variant)", () => {
    it("reports shaderF16Available true when the adapter supports the shader-f16 extension", async () => {
      vi.stubGlobal("navigator", {
        gpu: { requestAdapter: () => Promise.resolve(createFakeAdapter(["shader-f16"])) },
        deviceMemory: 8,
      });

      const result = await detect();

      expect(result.shaderF16Available).toBe(true);
    });

    it("reports shaderF16Available false when the adapter exists but doesn't support shader-f16 (common on Android GPU drivers)", async () => {
      vi.stubGlobal("navigator", {
        gpu: { requestAdapter: () => Promise.resolve(createFakeAdapter([])) },
        deviceMemory: 8,
      });

      const result = await detect();

      expect(result.webgpuAvailable).toBe(true);
      expect(result.shaderF16Available).toBe(false);
    });

    it("reports shaderF16Available false when requestAdapter resolves null (no adapter to read features from)", async () => {
      vi.stubGlobal("navigator", {
        gpu: { requestAdapter: () => Promise.resolve(null) },
        deviceMemory: 8,
      });

      const result = await detect();

      expect(result.shaderF16Available).toBe(false);
    });

    it("reports shaderF16Available false when navigator.gpu does not exist", async () => {
      vi.stubGlobal("navigator", { gpu: undefined, deviceMemory: 8 });

      const result = await detect();

      expect(result.shaderF16Available).toBe(false);
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

  describe("mobile-device probe (Requirement 1, model tier)", () => {
    it("reports isMobileDevice true from navigator.userAgentData.mobile when available (Chromium)", async () => {
      vi.stubGlobal("navigator", {
        gpu: undefined,
        deviceMemory: 8,
        userAgentData: { mobile: true },
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", // ignored: userAgentData takes precedence
      });

      const result = await detect();

      expect(result.isMobileDevice).toBe(true);
    });

    it("reports isMobileDevice false from navigator.userAgentData.mobile when available and false", async () => {
      vi.stubGlobal("navigator", {
        gpu: undefined,
        deviceMemory: 8,
        userAgentData: { mobile: false },
      });

      const result = await detect();

      expect(result.isMobileDevice).toBe(false);
    });

    it("falls back to a User-Agent string check when userAgentData is not exposed (e.g. Safari/iOS)", async () => {
      vi.stubGlobal("navigator", {
        gpu: undefined,
        deviceMemory: undefined,
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      });

      const result = await detect();

      expect(result.isMobileDevice).toBe(true);
    });

    it("reports isMobileDevice false on a desktop User-Agent with neither userAgentData nor deviceMemory", async () => {
      vi.stubGlobal("navigator", {
        gpu: undefined,
        deviceMemory: undefined,
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)",
      });

      const result = await detect();

      expect(result.isMobileDevice).toBe(false);
    });

    it("reports isMobileDevice false when neither userAgentData nor userAgent is exposed", async () => {
      vi.stubGlobal("navigator", { gpu: undefined, deviceMemory: 8 });

      const result = await detect();

      expect(result.isMobileDevice).toBe(false);
    });
  });
});
