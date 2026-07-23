// Smoke unit tests for `parseImport()`.
// The round-trip property test (Property 11) and the invalid-import
// rejection property test (Property 12) are implemented separately.
// See .kiro/specs/asistente-ia-local/design.md (section "Exportador_Conversaciones").
import { describe, expect, it } from "vitest";
import type { ExportedFile } from "../types/models";
import { parseImport } from "./parseImport";

describe("parseImport", () => {
  it("parses a valid exported file, generating a new id and preserving the messages", () => {
    const file: ExportedFile = {
      version: 1,
      id: "conv-original",
      createdAt: 1000,
      lastActivityAt: 1200,
      messages: [
        { role: "user", content: "hola", timestamp: 1100 },
        { role: "assistant", content: "hola, ¿en qué te ayudo?", timestamp: 1200 },
      ],
    };

    const result = parseImport(JSON.stringify(file));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.conversation.id).not.toBe("conv-original");
    expect(result.conversation.createdAt).toBe(1000);
    expect(result.conversation.messages).toHaveLength(2);
    expect(result.conversation.messages.map((m) => ({ role: m.role, content: m.content, timestamp: m.timestamp }))).toEqual([
      { role: "user", content: "hola", timestamp: 1100 },
      { role: "assistant", content: "hola, ¿en qué te ayudo?", timestamp: 1200 },
    ]);
  });

  it("returns error invalid_json when the text is not valid JSON", () => {
    const result = parseImport("{esto no es json");

    expect(result).toEqual({ ok: false, error: "invalid_json" });
  });

  it("returns error invalid_schema when the id is missing", () => {
    const result = parseImport(JSON.stringify({ createdAt: 1000, messages: [] }));

    expect(result).toEqual({ ok: false, error: "invalid_schema" });
  });

  it("returns error invalid_schema when a message has an invalid role", () => {
    const result = parseImport(
      JSON.stringify({
        id: "conv-1",
        createdAt: 1000,
        messages: [{ role: "moderador", content: "hola", timestamp: 1100 }],
      }),
    );

    expect(result).toEqual({ ok: false, error: "invalid_schema" });
  });

  it("returns error invalid_schema when the valid JSON is not an object (e.g. an array)", () => {
    const result = parseImport("[]");

    expect(result).toEqual({ ok: false, error: "invalid_schema" });
  });
});
