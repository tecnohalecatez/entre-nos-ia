// Tests for `isInStandaloneMode()` (task 22.2).
// See requirements.md (Requirements 11.4, 11.5): the System does not branch
// its functional behavior based on the display mode, so these tests only
// verify the detection itself (no functional effects).

import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { NotificationProvider } from "../notification";
import { AppStateProvider } from "./AppStateProvider";
import { useAppState } from "./useAppState";
import { ConversationManager } from "../conversation-manager/ConversationManager";
import { ConversationStoreDexie } from "../conversation-store/ConversationStore";
import type { InferenceEngine } from "../inference-engine/InferenceEngine";
import type { DecideInput, CompatibilityResult } from "../compatibility-detector/decide";
import type { ModelDownloadManager } from "../model-download-manager/ensureModelAvailable";
import { isInStandaloneMode } from "./standaloneMode";

describe("isInStandaloneMode()", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (navigator as { standalone?: boolean }).standalone;
  });

  it("returns true when matchMedia('(display-mode: standalone)').matches is true", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({
      matches: true,
    } as MediaQueryList);

    expect(isInStandaloneMode()).toBe(true);
  });

  it("returns false when matchMedia().matches is false and there's no navigator.standalone", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({
      matches: false,
    } as MediaQueryList);

    expect(isInStandaloneMode()).toBe(false);
  });

  it("returns true when navigator.standalone is true (Safari/iOS), even if matchMedia is false", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({
      matches: false,
    } as MediaQueryList);
    (navigator as { standalone?: boolean }).standalone = true;

    expect(isInStandaloneMode()).toBe(true);
  });
});

// --- 11.5: the whole tree works the same, regardless of Standalone_Mode ---
//
// The System does not branch its functional behavior based on the display
// mode (see design note in `standaloneMode.ts`): this suite verifies that
// `AppStateProvider` completes its boot sequence successfully (reaches
// `engineReady`) identically whether `isInStandaloneMode()` reports `true`
// or `false`, confirming there's no code path depending on that value to
// function.
describe("AppStateProvider - functional equivalence in Standalone_Mode (11.4, 11.5)", () => {
  beforeEach(() => {
    indexedDB.deleteDatabase("ConversationStore");
  });

  function createTestConversationManager(): ConversationManager {
    return new ConversationManager(new ConversationStoreDexie());
  }

  function createFakeInferenceEngine(): InferenceEngine {
    return {
      initialize: vi.fn().mockResolvedValue(undefined),
      generate: vi.fn(),
      cancel: vi.fn(),
    };
  }

  function createTestModelDownloadManager(): ModelDownloadManager {
    return { ensureModelAvailable: vi.fn().mockResolvedValue(undefined) };
  }

  const ANY_PROBE: DecideInput = {
    webgpuAvailable: true,
    wasmAvailable: true,
    memoryGB: 8,
    isMobileDevice: false,
  };
  const RESULT_WITH_ENGINE: CompatibilityResult = {
    webgpuAvailable: true,
    wasmAvailable: false,
    memoryGB: 8,
    selectedEngine: "webgpu",
    missingCapabilities: [],
    modelTier: "full",
  };

  function EngineReadyAndStandaloneModeProbe() {
    const { engineReady, degradedMode } = useAppState();
    return (
      <div>
        <p data-testid="engine-ready">{String(engineReady)}</p>
        <p data-testid="degraded-mode">{degradedMode === null ? "null" : "active"}</p>
        <p data-testid="standalone-mode-detected">{String(isInStandaloneMode())}</p>
      </div>
    );
  }

  function mountFullTree() {
    return render(
      <NotificationProvider>
        <AppStateProvider
          detectFn={vi.fn().mockResolvedValue(ANY_PROBE)}
          decideFn={vi.fn().mockReturnValue(RESULT_WITH_ENGINE)}
          createInferenceEngine={createFakeInferenceEngine}
          createConversationManager={createTestConversationManager}
          modelDownloadManager={createTestModelDownloadManager()}
        >
          <EngineReadyAndStandaloneModeProbe />
        </AppStateProvider>
      </NotificationProvider>,
    );
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("completes boot the same way (engineReady=true, no Degraded_Mode) when matchMedia reports Standalone_Mode active", async () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);

    mountFullTree();

    await waitFor(() => {
      expect(screen.getByTestId("engine-ready").textContent).toBe("true");
    });
    expect(screen.getByTestId("degraded-mode").textContent).toBe("null");
    expect(screen.getByTestId("standalone-mode-detected").textContent).toBe("true");
  });

  it("completes boot the same way (engineReady=true, no Degraded_Mode) when matchMedia reports Standalone_Mode inactive (normal tab)", async () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: false } as MediaQueryList);

    mountFullTree();

    await waitFor(() => {
      expect(screen.getByTestId("engine-ready").textContent).toBe("true");
    });
    expect(screen.getByTestId("degraded-mode").textContent).toBe("null");
    expect(screen.getByTestId("standalone-mode-detected").textContent).toBe("false");
  });
});
