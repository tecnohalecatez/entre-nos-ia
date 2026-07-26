// Smoke unit tests for `exportConversation()` and `serializeExport()`.
// The round-trip property test (Property 11) is implemented separately
// alongside `parseImport()`.
// See .kiro/specs/asistente-ia-local/design.md (section "Exportador_Conversaciones").
import { describe, expect, it } from "vitest";
import type { ExportedFile, Conversation } from "../types/models";
import { exportConversation, serializeExport } from "./exportConversation";

describe("exportConversation", () => {
  it("maps id, createdAt, version and messages in order, computing lastActivityAt from the last message", () => {
    const conversation: Conversation = {
      id: "conv-1",
      createdAt: 1000,
      messages: [
        { id: "m1", role: "user", content: "hola", timestamp: 1100 },
        { id: "m2", role: "assistant", content: "hola, ¿en qué te ayudo?", timestamp: 1200 },
      ],
    };

    const result = exportConversation(conversation);

    expect(result).toEqual({
      version: 1,
      id: "conv-1",
      createdAt: 1000,
      lastActivityAt: 1200,
      messages: [
        { role: "user", content: "hola", timestamp: 1100 },
        { role: "assistant", content: "hola, ¿en qué te ayudo?", timestamp: 1200 },
      ],
    });
  });

  it("uses createdAt as lastActivityAt when the conversation has no messages", () => {
    const conversation: Conversation = { id: "conv-2", createdAt: 5000, messages: [] };

    const result = exportConversation(conversation);

    expect(result.lastActivityAt).toBe(5000);
    expect(result.messages).toEqual([]);
  });
});

describe("serializeExport", () => {
  it("produces a JSON that round-trips via JSON.parse preserving all fields", () => {
    const conversation: Conversation = {
      id: "conv-3",
      createdAt: 42,
      messages: [{ id: "m1", role: "user", content: "test", timestamp: 43 }],
    };

    const exported = exportConversation(conversation);
    const text = serializeExport(exported);
    const parsed = JSON.parse(text) as ExportedFile;

    expect(parsed).toEqual(exported);
  });
});
