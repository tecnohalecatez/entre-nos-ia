// Smoke unit tests for `readImportedFile()`.
// See .kiro/specs/asistente-ia-local/design.md (section "Exportador_Conversaciones").
import { describe, expect, it } from "vitest";
import type { ExportedFile } from "../types/models";
import { readImportedFile } from "./readImportedFile";

function createTextFile(text: string, name = "conversacion.json"): File {
  return new File([text], name, { type: "application/json" });
}

describe("readImportedFile", () => {
  it("reads and parses a valid file, returning a conversation with a new id", async () => {
    const exportedFile: ExportedFile = {
      version: 1,
      id: "conv-original",
      createdAt: 1000,
      lastActivityAt: 1100,
      messages: [{ role: "user", content: "hola", timestamp: 1100 }],
    };
    const file = createTextFile(JSON.stringify(exportedFile));

    const result = await readImportedFile(file);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.conversation.id).not.toBe("conv-original");
    expect(result.conversation.messages).toHaveLength(1);
  });

  it("returns error invalid_json when the file content is not valid JSON", async () => {
    const file = createTextFile("{esto no es json");

    const result = await readImportedFile(file);

    expect(result).toEqual({ ok: false, error: "invalid_json" });
  });

  it("returns error invalid_schema when the JSON is valid but does not satisfy the expected schema", async () => {
    const file = createTextFile(JSON.stringify({ foo: "bar" }));

    const result = await readImportedFile(file);

    expect(result).toEqual({ ok: false, error: "invalid_schema" });
  });
});
