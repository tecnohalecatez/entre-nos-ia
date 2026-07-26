// Smoke unit tests for `readImportedFile()`.
// See .kiro/specs/asistente-ia-local/design.md (section "Exportador_Conversaciones").
import { describe, expect, it, vi } from "vitest";
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

  it("returns error file_too_large without reading the file's content when it exceeds maxBytes", async () => {
    // `file.text()` is spied on to prove the oversized file's content is
    // never actually read (the size check must short-circuit before it) --
    // this is what protects against a huge crafted file freezing the tab.
    const file = createTextFile("x".repeat(20));
    const textSpy = vi.spyOn(file, "text");

    const result = await readImportedFile(file, 10);

    expect(result).toEqual({ ok: false, error: "file_too_large" });
    expect(textSpy).not.toHaveBeenCalled();
  });

  it("accepts a file at or under maxBytes", async () => {
    const exportedFile: ExportedFile = {
      version: 1,
      id: "conv-original",
      createdAt: 1000,
      lastActivityAt: 1100,
      messages: [],
    };
    const text = JSON.stringify(exportedFile);
    const file = createTextFile(text);

    const result = await readImportedFile(file, new TextEncoder().encode(text).length);

    expect(result.ok).toBe(true);
  });
});
