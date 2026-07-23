// Smoke unit tests for `downloadExportedFile()`.
// The detailed write-error-handling tests (7.2) are implemented in task
// 13.6; here we cover the success case and a basic forced failure to
// validate the browser I/O flow.
// See .kiro/specs/asistente-ia-local/design.md (section "Exportador_Conversaciones").
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Conversation } from "../types/models";
import { downloadExportedFile } from "./downloadExportedFile";

function createConversation(): Conversation {
  return {
    id: "conv-1",
    createdAt: 1000,
    messages: [{ id: "m1", role: "user", content: "hola", timestamp: 1100 }],
  };
}

describe("downloadExportedFile", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a Blob, a temporary download link and revokes the object URL on the success path", () => {
    const createObjectURLSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-url");
    const revokeObjectURLSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    const result = downloadExportedFile(createConversation());

    expect(result).toEqual({ ok: true });
    expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURLSpy).toHaveBeenCalledWith("blob:mock-url");
  });

  it("returns an error result without having triggered the download when creating the object URL fails", () => {
    const createObjectURLSpy = vi.spyOn(URL, "createObjectURL").mockImplementation(() => {
      throw new Error("fallo simulado de escritura");
    });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    const result = downloadExportedFile(createConversation());

    expect(result).toEqual({ ok: false, error: "fallo simulado de escritura" });
    expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
    // Since it failed before creating the link, no download was ever triggered.
    expect(clickSpy).not.toHaveBeenCalled();
  });
});
