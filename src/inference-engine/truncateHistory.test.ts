// Unit tests for `truncateHistory()`. See the file header for the design
// rationale (bounding the prompt sent to the Motor_Inferencia against the
// model's context window).

import { describe, expect, it } from "vitest";
import type { Message } from "../types/models";
import { truncateHistory } from "./truncateHistory";

function createMessage(id: string, content: string): Message {
  return { id, role: "user", content, timestamp: 0 };
}

describe("truncateHistory", () => {
  it("returns the history unchanged when it fits entirely within the budget", () => {
    const history = [createMessage("1", "hola"), createMessage("2", "que tal")];

    expect(truncateHistory(history, 1000)).toEqual(history);
  });

  it("returns an empty array when the history is empty", () => {
    expect(truncateHistory([], 1000)).toEqual([]);
  });

  it("drops the oldest messages first, keeping chronological order among the survivors", () => {
    const history = [
      createMessage("old", "A".repeat(50)),
      createMessage("mid", "B".repeat(50)),
      createMessage("recent", "C".repeat(50)),
    ];

    // Budget fits only the last two messages (2*50 = 100), not all three.
    const result = truncateHistory(history, 100);

    expect(result.map((m) => m.id)).toEqual(["mid", "recent"]);
  });

  it("always keeps the single most recent message, even alone over budget", () => {
    const history = [createMessage("old", "hola"), createMessage("recent", "X".repeat(500))];

    const result = truncateHistory(history, 10);

    expect(result.map((m) => m.id)).toEqual(["recent"]);
  });

  it("never returns more messages than it received", () => {
    const history = [createMessage("1", "a"), createMessage("2", "b"), createMessage("3", "c")];

    expect(truncateHistory(history, 0).length).toBeLessThanOrEqual(history.length);
  });
});
