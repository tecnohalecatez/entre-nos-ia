import { describe, expect, it, vi } from "vitest";
import type { GenerationState } from "../inference-engine/reduceGeneration";
import {
  createUpdateController,
  canUpdateNow,
} from "./serviceWorkerUpdateController";

const userMessage = {
  id: "msg-1",
  role: "user" as const,
  content: "hola",
  timestamp: 0,
};

const idleState: GenerationState = { type: "idle" };
const generatingState: GenerationState = {
  type: "generating",
  userMessage,
  partialText: "...",
};
const completedState: GenerationState = {
  type: "completed",
  userMessage,
  assistantMessage: { ...userMessage, id: "msg-2", role: "assistant" },
};

describe("canUpdateNow", () => {
  it("returns false while a response is being generated (9.4, 9.5)", () => {
    expect(canUpdateNow(generatingState)).toBe(false);
  });

  it.each([idleState, completedState])(
    "returns true for states other than 'generating'",
    (state) => {
      expect(canUpdateNow(state)).toBe(true);
    },
  );
});

describe("createUpdateController", () => {
  it("sends SKIP_WAITING immediately if there is no generation in progress (9.2)", () => {
    const sendSkipWaiting = vi.fn();
    const controller = createUpdateController(sendSkipWaiting);

    const result = controller.requestUpdate(idleState);

    expect(result).toBe("applied");
    expect(sendSkipWaiting).toHaveBeenCalledTimes(1);
  });

  it("defers sending SKIP_WAITING while a response is being generated (9.5)", () => {
    const sendSkipWaiting = vi.fn();
    const controller = createUpdateController(sendSkipWaiting);

    const result = controller.requestUpdate(generatingState);

    expect(result).toBe("deferred");
    expect(sendSkipWaiting).not.toHaveBeenCalled();
  });

  it("applies the deferred update as soon as the generation finishes (9.4, 9.5)", () => {
    const sendSkipWaiting = vi.fn();
    const controller = createUpdateController(sendSkipWaiting);

    controller.requestUpdate(generatingState);
    expect(sendSkipWaiting).not.toHaveBeenCalled();

    // Generation is still in progress: not applied yet.
    controller.notifyGenerationStateChange(generatingState);
    expect(sendSkipWaiting).not.toHaveBeenCalled();

    // Generation finishes: the deferred update is now applied.
    controller.notifyGenerationStateChange(completedState);
    expect(sendSkipWaiting).toHaveBeenCalledTimes(1);
  });

  it("does not resend SKIP_WAITING if no update had been deferred", () => {
    const sendSkipWaiting = vi.fn();
    const controller = createUpdateController(sendSkipWaiting);

    controller.notifyGenerationStateChange(completedState);

    expect(sendSkipWaiting).not.toHaveBeenCalled();
  });

  it("if the user dismisses the notification (never calls requestUpdate), nothing is interrupted (9.6)", () => {
    const sendSkipWaiting = vi.fn();
    const controller = createUpdateController(sendSkipWaiting);

    controller.notifyGenerationStateChange(generatingState);
    controller.notifyGenerationStateChange(completedState);

    expect(sendSkipWaiting).not.toHaveBeenCalled();
  });
});
