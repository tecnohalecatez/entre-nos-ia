// Snapshot/visual-regression tests for `ChatInterface`'s responsive design
// (task 20.2, Requirement 10: 10.1, 10.2, 10.3).
//
// --- Why this approach and not pixel-perfect visual snapshots ---
//
// This project's test environment is Vitest + happy-dom (see
// `vitest.config.ts`). happy-dom (like jsdom) does NOT implement a real
// layout engine: it doesn't compute boxes, doesn't evaluate `@media`
// queries against a viewport width, and `getComputedStyle` doesn't reflect
// the rules of an external `<link>`/`<style>` conditionally applied per
// breakpoint. Screenshot-comparison tools (e.g. Playwright) aren't part of
// this project's stack (see design.md, "Testing Strategy": "Responsive
// design (10.1, 10.2, 10.3): snapshot/visual-regression tests, [...] run
// with component-testing tools across different simulated viewports").
//
// Given this, "visual regression" is interpreted here pragmatically with
// two complementary techniques, both deterministic and without a real
// rendering engine:
//
// 1. **DOM structure snapshot** (`toMatchSnapshot()`): captures
//    `ChatInterface`'s rendered tree so that any future change to the
//    container structure (which is what the breakpoint CSS rules hook
//    into) is explicitly flagged in a code review, even without being able
//    to verify the actual visual result.
// 2. **Text assertions over `ChatInterface.css`**: instead of simulating a
//    viewport width and expecting happy-dom to apply the corresponding
//    `@media` rule (it doesn't), the CSS file's content is read as text and
//    it's verified that each breakpoint's rules (`max-width: 768px` for
//    mobile, `min-width: 769px` for desktop) contain the expected
//    declarations on the correct selectors. This is a real regression
//    test: if someone changes or removes one of these rules, the test
//    fails, even without running real layout.
//
// These tests complement (don't replace) `ChatInterface.test.tsx` (task
// 20.1), which verifies structural composition without failing.
//
// See .kiro/specs/asistente-ia-local/requirements.md (10.1, 10.2, 10.3) and
// design.md ("Testing Strategy").

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { NotificationProvider } from "../notification";
import { AppStateProvider } from "../app-state/AppStateProvider";
import type { AppStateProviderProps } from "../app-state/AppStateProvider";
import { ConversationManager } from "../conversation-manager/ConversationManager";
import { ConversationStoreDexie } from "../conversation-store/ConversationStore";
import type { InferenceEngine } from "../inference-engine/InferenceEngine";
import type { DecideInput, CompatibilityResult } from "../compatibility-detector/decide";
import type { ModelDownloadManager } from "../model-download-manager/ensureModelAvailable";
import { ChatInterface } from "./ChatInterface";

const CURRENT_DIR = dirname(new URL(import.meta.url).pathname);
const CSS_PATH = join(CURRENT_DIR, "ChatInterface.css");
const CHAT_INTERFACE_CSS = readFileSync(CSS_PATH, "utf-8");

beforeEach(() => {
  // fake-indexeddb doesn't isolate automatically between tests (same
  // pattern as the rest of the Chat_Interface suites).
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

const ANY_PROBE: DecideInput = {
  webgpuAvailable: true,
  wasmAvailable: true,
  memoryGB: 8,
};

const RESULT_WITH_ENGINE: CompatibilityResult = {
  webgpuAvailable: true,
  wasmAvailable: false,
  memoryGB: 8,
  selectedEngine: "webgpu",
  missingCapabilities: [],
};

/**
 * Test `ModelDownloadManager`: resolves immediately with no real I/O.
 * Needed since task 22.2, as `AppStateProvider`'s production default is no
 * longer `undefined` (it would attempt a real `fetch`).
 */
function createTestModelDownloadManager(): ModelDownloadManager {
  return { ensureModelAvailable: vi.fn().mockResolvedValue(undefined) };
}

function renderWithProviders(props: Partial<AppStateProviderProps> = {}) {
  return render(
    <NotificationProvider>
      <AppStateProvider
        detectFn={vi.fn().mockResolvedValue(ANY_PROBE)}
        decideFn={vi.fn().mockReturnValue(RESULT_WITH_ENGINE)}
        createInferenceEngine={createFakeInferenceEngine}
        createConversationManager={createTestConversationManager}
        modelDownloadManager={createTestModelDownloadManager()}
        {...props}
      >
        <ChatInterface />
      </AppStateProvider>
    </NotificationProvider>,
  );
}

/** Waits for `AppStateProvider`'s boot sequence to finish. */
async function waitForBoot(): Promise<void> {
  await waitFor(() => {
    expect(screen.queryByText(/preparando el asistente/i)).not.toBeInTheDocument();
  });
}

/**
 * Extracts the body of the first `@media` rule whose condition contains
 * `partialCondition`, to be able to assert specific declarations within
 * that breakpoint without depending on happy-dom evaluating the media
 * query.
 */
function extractMediaQueryBlock(css: string, partialCondition: string): string {
  const mediaStartIndex = css.indexOf(`@media (${partialCondition}`);
  expect(mediaStartIndex, `Could not find @media (${partialCondition}...) in ChatInterface.css`).toBeGreaterThanOrEqual(0);

  const openBraceIndex = css.indexOf("{", mediaStartIndex);
  let depth = 1;
  let index = openBraceIndex + 1;
  while (depth > 0 && index < css.length) {
    if (css[index] === "{") depth += 1;
    if (css[index] === "}") depth -= 1;
    index += 1;
  }
  return css.slice(openBraceIndex + 1, index - 1);
}

describe("ChatInterface — responsive design (10.1, 10.2, 10.3)", () => {
  it("DOM structure snapshot of the assembled layout (structural regression)", async () => {
    const { container } = renderWithProviders();
    await waitForBoot();

    // Trimmed to `.chat-interface` (without wrapping Providers) so the
    // snapshot stays stable against internal Provider changes that don't
    // affect the responsive layout itself.
    const layout = container.querySelector(".chat-interface");
    expect(layout).not.toBeNull();
    expect(layout).toMatchSnapshot();
  });

  it("stacks the conversation list above the chat area at the mobile breakpoint (max-width: 768px) (10.1)", () => {
    const mobileBlock = extractMediaQueryBlock(CHAT_INTERFACE_CSS, "max-width: 768px");

    // The body switches to column: without this, the conversation list and
    // chat area would sit side by side at narrow widths, forcing
    // horizontal scroll.
    expect(mobileBlock).toMatch(/\.chat-interface__body\s*{[^}]*flex-direction:\s*column/);

    // The conversation list is height-bounded and gets its own scroll
    // instead of expanding the container's width.
    expect(mobileBlock).toMatch(/\.chat-interface__conversation-list\s*{[^}]*overflow-y:\s*auto/);
  });

  it("shows the conversation list and the chat area side by side at the desktop breakpoint (min-width: 769px) (10.2)", () => {
    const desktopBlock = extractMediaQueryBlock(CHAT_INTERFACE_CSS, "min-width: 769px");

    // Bounded-width side panel (doesn't grow to invade the main area nor
    // force document horizontal scroll).
    expect(desktopBlock).toMatch(/\.chat-interface__conversation-list\s*{[^}]*flex:\s*0 0 260px/);
    expect(desktopBlock).toMatch(/\.chat-interface__conversation-list\s*{[^}]*max-width:\s*260px/);

    // Outside the mobile block, there's no rule forcing `flex-direction:
    // column` on the body at this width: `.chat-interface__body`'s default
    // `display: flex` (row) stays active, showing the panels side by side.
    expect(desktopBlock).not.toMatch(/\.chat-interface__body/);
  });

  it("MessageInput doesn't shrink (flex: 0 0 auto) and stays anchored to the bottom of the chat area (10.3)", () => {
    // `MessageInput` must stay visible together with the most recent
    // message across any viewport resize (including orientation changes),
    // without depending on an `orientationchange` listener: this is
    // achieved by fixing its size on the main axis of the flex container
    // that holds it.
    expect(CHAT_INTERFACE_CSS).toMatch(
      /\.chat-interface__main\s*>\s*\.message-input\s*{[^}]*flex:\s*0 0 auto/,
    );
  });

  it("MessageHistory is the only region that grows/shrinks and scrolls, keeping the most recent message reachable (10.3)", () => {
    // See MessageHistory.css (task 17.2): the history takes up the
    // remaining space (`flex: 1 1 auto`) and scrolls internally
    // (`overflow-y: auto`) instead of expanding the document's height, so
    // the message input always stays within the visible viewport.
    const historyCssPath = join(CURRENT_DIR, "MessageHistory.css");
    const historyCss = readFileSync(historyCssPath, "utf-8");

    expect(historyCss).toMatch(/\.message-history\s*{[^}]*overflow-y:\s*auto/);
    expect(historyCss).toMatch(/\.message-history\s*{[^}]*flex:\s*1 1 auto/);
  });

  it("the root container fixes its height to the viewport without letting its own overflow grow (avoids document scroll)", () => {
    // `.chat-interface` (root container) fixes its height to the
    // viewport's and hides any overflow of its own; it's its internal
    // children (history, conversation list) that scroll, never the whole
    // document. Together with the previous assertions, this is what
    // guarantees no width/orientation forces document horizontal scroll
    // (10.1, 10.2) or hides the message input (10.3).
    expect(CHAT_INTERFACE_CSS).toMatch(/\.chat-interface\s*{[^}]*height:\s*100dvh/);
    expect(CHAT_INTERFACE_CSS).toMatch(/\.chat-interface\s*{[^}]*overflow:\s*hidden/);
  });
});
