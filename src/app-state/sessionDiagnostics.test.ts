// Unit tests for `sessionDiagnostics.ts`. See the file header for the
// design rationale (distinguishing a crashed previous session from a
// deliberate, known reload).

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  markLoadingStarted,
  markLoadingFinished,
  markGenerationStarted,
  markGenerationFinished,
  markReloadReason,
  takePreviousSessionSignal,
  recordLoadCrash,
  resetLoadCrashCount,
} from "./sessionDiagnostics";

describe("sessionDiagnostics", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    window.sessionStorage.clear();
  });

  it("reports 'none' when nothing was marked (fresh session, or the previous one ended normally)", () => {
    expect(takePreviousSessionSignal()).toBe("none");
  });

  it("reports 'crashed_while_generating' when the generating marker was left set with no reload reason", () => {
    markGenerationStarted();
    // No markGenerationFinished(), no markReloadReason(): simulates the tab
    // ending (crashing) mid-generation, with no code of ours getting to run.

    expect(takePreviousSessionSignal()).toBe("crashed_while_generating");
  });

  it("reports 'none' when generation completed normally (markGenerationFinished clears the marker)", () => {
    markGenerationStarted();
    markGenerationFinished();

    expect(takePreviousSessionSignal()).toBe("none");
  });

  it("reports 'none' when the generating marker is set but a known reload reason is also present (e.g. an SW update reload landing mid-generation)", () => {
    markGenerationStarted();
    markReloadReason("sw-update");

    expect(takePreviousSessionSignal()).toBe("none");
  });

  it("clears both markers so a second call in the same session reports 'none'", () => {
    markGenerationStarted();

    expect(takePreviousSessionSignal()).toBe("crashed_while_generating");
    expect(takePreviousSessionSignal()).toBe("none");
  });

  it("reports 'crashed_while_loading' when the loading marker was left set with no reload reason (a phone silently reloading mid model-load)", () => {
    markLoadingStarted();
    // No markLoadingFinished(), no markReloadReason(): simulates the tab
    // ending (crashing) while InferenceEngine.initialize() was in flight.

    expect(takePreviousSessionSignal()).toBe("crashed_while_loading");
  });

  it("reports 'none' when loading completed normally (markLoadingFinished clears the marker)", () => {
    markLoadingStarted();
    markLoadingFinished();

    expect(takePreviousSessionSignal()).toBe("none");
  });

  it("reports 'none' when the loading marker is set but a known reload reason is also present", () => {
    markLoadingStarted();
    markReloadReason("sw-update");

    expect(takePreviousSessionSignal()).toBe("none");
  });

  it("prioritizes 'crashed_while_loading' over 'crashed_while_generating' if both markers were somehow left set", () => {
    markLoadingStarted();
    markGenerationStarted();

    expect(takePreviousSessionSignal()).toBe("crashed_while_loading");
  });

  describe("recordLoadCrash / resetLoadCrashCount", () => {
    it("increments across calls, persisting the count", () => {
      expect(recordLoadCrash()).toBe(1);
      expect(recordLoadCrash()).toBe(2);
      expect(recordLoadCrash()).toBe(3);
    });

    it("resets back to counting from 1 after resetLoadCrashCount()", () => {
      recordLoadCrash();
      recordLoadCrash();
      resetLoadCrashCount();

      expect(recordLoadCrash()).toBe(1);
    });

    it("starts at 1 on a fresh session with nothing recorded yet", () => {
      expect(recordLoadCrash()).toBe(1);
    });
  });
});
