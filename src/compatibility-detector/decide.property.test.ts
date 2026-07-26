// Comprehensive property test for `decide()`. Example-based smoke tests
// live in `decide.test.ts`.
// See .kiro/specs/asistente-ia-local/design.md (section "Correctness Properties",
// Property 1) and requirements.md (1.3, 1.4, 1.5, 1.7, 1.8, 10.6).
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { decide } from "./decide";

describe("decide - property test", () => {
  // Feature: asistente-ia-local, Property 1: Decisión de motor de inferencia y modo degradado
  it("selects the correct engine and reports exactly the missing capabilities", () => {
    fc.assert(
      fc.property(
        fc.record({
          webgpuAvailable: fc.boolean(),
          wasmAvailable: fc.boolean(),
          memoryGB: fc.option(fc.integer({ min: 0, max: 32 })),
          isMobileDevice: fc.boolean(),
          shaderF16Available: fc.boolean(),
        }),
        (input) => {
          const result = decide(input);
          const { webgpuAvailable, wasmAvailable, memoryGB, isMobileDevice, shaderF16Available } = input;

          const enoughMemory = memoryGB === null || memoryGB >= 4;

          const expectsWebgpu = webgpuAvailable && enoughMemory;
          const expectsWasm = !webgpuAvailable && wasmAvailable && enoughMemory;

          // Selects "webgpu" if and only if webgpu is available and there is enough memory.
          expect(result.selectedEngine === "webgpu").toBe(expectsWebgpu);
          // Selects "wasm" if and only if webgpu is unavailable, wasm is available and there is enough memory.
          expect(result.selectedEngine === "wasm").toBe(expectsWasm);
          // "none" in any other case.
          expect(result.selectedEngine === "none").toBe(!expectsWebgpu && !expectsWasm);

          // missingCapabilities SHALL reflect exactly the unmet capabilities
          // that led to the decision, following the implemented precedence
          // order (insufficient memory -> only "memory"; otherwise, "webgpu"
          // and/or "wasm" missing when none is selected).
          let expectedCapabilities: string[];
          if (!enoughMemory) {
            expectedCapabilities = ["memory"];
          } else if (webgpuAvailable || wasmAvailable) {
            expectedCapabilities = [];
          } else {
            expectedCapabilities = ["webgpu", "wasm"];
          }

          expect(result.missingCapabilities).toEqual(expectedCapabilities);

          // The result always preserves the input data unchanged.
          expect(result.webgpuAvailable).toBe(webgpuAvailable);
          expect(result.wasmAvailable).toBe(wasmAvailable);
          expect(result.memoryGB).toBe(memoryGB);

          // modelTier is "compact" iff the device is mobile or reports less
          // than the full-model memory threshold (8 GB); "full" otherwise.
          // Independent of selectedEngine/missingCapabilities precedence.
          const expectsCompactTier = isMobileDevice || (memoryGB !== null && memoryGB < 8);
          expect(result.modelTier).toBe(expectsCompactTier ? "compact" : "full");

          // shaderF16Available is a pure pass-through: it must never affect
          // selectedEngine/missingCapabilities/modelTier (there's always a
          // fallback model variant, so it's never a blocking incompatibility).
          expect(result.shaderF16Available).toBe(shaderF16Available);
        },
      ),
      { numRuns: 100 },
    );
  });
});
