import { describe, expect, it } from "vitest";
import { lastActivityAt, type Conversation, type Message } from "./models";

describe("lastActivityAt", () => {
  it("returns createdAt when the conversation has no messages", () => {
    const conversation: Conversation = {
      id: "conv-1",
      createdAt: 1000,
      messages: [],
    };

    expect(lastActivityAt(conversation)).toBe(1000);
  });

  it("returns the timestamp of the last message when there are messages", () => {
    const messages: Message[] = [
      { id: "m1", role: "user", content: "hola", timestamp: 1000 },
      { id: "m2", role: "assistant", content: "hola!", timestamp: 2000 },
      { id: "m3", role: "user", content: "gracias", timestamp: 3000 },
    ];
    const conversation: Conversation = {
      id: "conv-2",
      createdAt: 500,
      messages,
    };

    expect(lastActivityAt(conversation)).toBe(3000);
  });

  it("uses insertion order, not the max timestamp, to determine the last message", () => {
    const messages: Message[] = [
      { id: "m1", role: "user", content: "hola", timestamp: 5000 },
      { id: "m2", role: "assistant", content: "hola!", timestamp: 100 },
    ];
    const conversation: Conversation = {
      id: "conv-3",
      createdAt: 1,
      messages,
    };

    expect(lastActivityAt(conversation)).toBe(100);
  });
});
