// App_State: `modelLoadProgress.ts` tests. The `text` fixtures below are
// copied VERBATIM from `node_modules/@mlc-ai/web-llm/lib/index.js` (its
// `fetchTensorCacheInternal`/`reload` methods) so this test breaks loudly if
// a WebLLM upgrade changes the wording our phase detection depends on.

import { describe, expect, it } from "vitest";
import { parseModelLoadProgress, modelLoadPhaseLabel } from "./modelLoadProgress";
import type { InitializationProgressReport } from "../inference-engine/InferenceEngine";

function report(overrides: Partial<InitializationProgressReport>): InitializationProgressReport {
  return { progress: 0, timeElapsed: 0, text: "", ...overrides };
}

describe("parseModelLoadProgress", () => {
  it("classifies the initial report as 'starting', with no step/megabytes", () => {
    const result = parseModelLoadProgress(report({ progress: 0, timeElapsed: 0, text: "Start to fetch params" }));
    expect(result).toEqual({
      phase: "starting",
      percentage: 0,
      step: null,
      megabytes: null,
      secondsElapsed: 0,
    });
  });

  it("classifies a download report as 'downloading', extracting step/megabytes/percentage", () => {
    const result = parseModelLoadProgress(
      report({
        progress: 0.62,
        timeElapsed: 14,
        text: "Fetching param cache[6/23]: 512MB fetched. 62% completed, 14 secs elapsed. It can take a while when we first visit this page to populate the cache. Later refreshes will become faster.",
      }),
    );
    expect(result).toEqual({
      phase: "downloading",
      percentage: 62,
      step: { current: 6, total: 23 },
      megabytes: 512,
      secondsElapsed: 14,
    });
  });

  it("classifies a cache-load report as 'loading_weights'", () => {
    const result = parseModelLoadProgress(
      report({
        progress: 0.62,
        timeElapsed: 14,
        text: "Loading model from cache[6/23]: 512MB loaded. 62% completed, 14 secs elapsed.",
      }),
    );
    expect(result).toEqual({
      phase: "loading_weights",
      percentage: 62,
      step: { current: 6, total: 23 },
      megabytes: 512,
      secondsElapsed: 14,
    });
  });

  it("classifies a shader-compilation report as 'compiling_shaders', with no megabytes", () => {
    const result = parseModelLoadProgress(
      report({
        progress: 0.66,
        timeElapsed: 3,
        text: "Loading GPU shader modules[80/120]: 66% completed, 3 secs elapsed.",
      }),
    );
    expect(result).toEqual({
      phase: "compiling_shaders",
      percentage: 66,
      step: { current: 80, total: 120 },
      megabytes: null,
      secondsElapsed: 3,
    });
  });

  it("classifies the final report as 'ready' at 100%, with no step/megabytes", () => {
    const result = parseModelLoadProgress(
      report({ progress: 1, timeElapsed: 22.5, text: "Finish loading on WebGPU - Apple M1" }),
    );
    expect(result).toEqual({
      phase: "ready",
      percentage: 100,
      step: null,
      megabytes: null,
      secondsElapsed: 22.5,
    });
  });

  it("falls back to 'starting' for an unrecognized text instead of throwing", () => {
    const result = parseModelLoadProgress(report({ progress: 0.3, timeElapsed: 5, text: "some future WebLLM message" }));
    expect(result.phase).toBe("starting");
    expect(result.percentage).toBe(30);
  });
});

describe("modelLoadPhaseLabel", () => {
  it("returns a distinct Spanish label for every phase", () => {
    const phases = ["starting", "downloading", "loading_weights", "compiling_shaders", "ready"] as const;
    const labels = phases.map(modelLoadPhaseLabel);
    expect(new Set(labels).size).toBe(phases.length);
    for (const label of labels) {
      expect(label.length).toBeGreaterThan(0);
    }
  });
});
