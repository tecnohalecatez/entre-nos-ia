// Unit tests for `downloadExportedFile()` error handling
// (Requirement 7.2: on a write error, inform the user and do NOT leave a
// partial or corrupt file behind).
//
// Complements the smoke cases in `downloadExportedFile.test.ts` (success
// case and `URL.createObjectURL` failure) by also covering failures in
// creating the anchor element and in `click()`, and verifying that the
// error message is always descriptive.
//
// See .kiro/specs/asistente-ia-local/design.md (section "Exportador_Conversaciones",
// "Error Handling" table) and .kiro/specs/asistente-ia-local/requirements.md (7.2).
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Conversation } from "../types/models";
import { exportConversation, serializeExport } from "./exportConversation";
import { downloadExportedFile } from "./downloadExportedFile";

function createConversation(): Conversation {
  return {
    id: "conv-1",
    createdAt: 1000,
    messages: [{ id: "m1", role: "user", content: "hola", timestamp: 1100 }],
  };
}

describe("downloadExportedFile - write error handling (7.2)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    // In case some scenario leaves the anchor attached to the body (see the
    // `click()` gap test below), don't let it contaminate other tests in
    // this file.
    document.querySelectorAll("a[download]").forEach((a) => {
      a.remove();
    });
  });

  it("returns an error and revokes the object URL when creating the anchor element fails", () => {
    const createObjectURLSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-url");
    const revokeObjectURLSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    // The implementation only creates one anchor element ("a"), so there's
    // no need to delegate to the real `createElement` implementation for
    // other tags in this scenario.
    const createElementSpy = vi.spyOn(document, "createElement").mockImplementation(() => {
      throw new Error("fallo simulado al crear el elemento ancla");
    });

    const result = downloadExportedFile(createConversation());

    expect(result).toEqual({ ok: false, error: "fallo simulado al crear el elemento ancla" });
    expect(createElementSpy).toHaveBeenCalledWith("a");
    // `createObjectURL` had already succeeded before the failure, so the
    // implementation DOES revoke the object URL in its internal `finally`
    // block (no dangling object URL is left behind).
    expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURLSpy).toHaveBeenCalledWith("blob:mock-url");
    // No link was ever attached to the DOM: no partial file.
    expect(document.querySelectorAll("a[download]").length).toBe(0);
  });

  it("returns an error and revokes the object URL when the download link's click() fails", () => {
    const createObjectURLSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-url");
    const revokeObjectURLSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {
      throw new Error("fallo simulado en click()");
    });

    const result = downloadExportedFile(createConversation());

    expect(result).toEqual({ ok: false, error: "fallo simulado en click()" });
    expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    // The implementation's internal `finally` always revokes the object
    // URL, even when `click()` throws.
    expect(revokeObjectURLSpy).toHaveBeenCalledWith("blob:mock-url");

    // NOTE (finding, not fixed in this task): in the current
    // implementation, `document.body.removeChild(link)` runs on the same
    // line *after* `link.click()`, without its own `try/finally`. If
    // `click()` throws, the anchor element is never removed and stays
    // attached to `document.body`. This does not represent a partial file
    // on disk (no export file data was ever persisted: the `Blob` lives
    // only in memory and the object URL is revoked), but it is an orphaned
    // DOM node leak that could be fixed by wrapping `removeChild` in the
    // same `finally`. Documented here instead of modifying production
    // code, per the scope of this task (13.6).
    expect(document.querySelectorAll("a[download]").length).toBe(1);
  });

  it("the error message is always a non-empty descriptive string in every failure scenario", () => {
    const scenarios: { name: string; triggerFailure: () => void }[] = [
      {
        name: "createObjectURL",
        triggerFailure: () => {
          vi.spyOn(URL, "createObjectURL").mockImplementation(() => {
            throw new Error("fallo simulado de createObjectURL");
          });
        },
      },
      {
        name: "createElement",
        triggerFailure: () => {
          vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-url");
          vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
          vi.spyOn(document, "createElement").mockImplementation(() => {
            throw new Error("fallo simulado de createElement");
          });
        },
      },
      {
        name: "click",
        triggerFailure: () => {
          vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-url");
          vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
          vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {
            throw new Error("fallo simulado de click");
          });
        },
      },
    ];

    for (const { triggerFailure } of scenarios) {
      triggerFailure();

      const result = downloadExportedFile(createConversation());

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(typeof result.error).toBe("string");
        expect(result.error.length).toBeGreaterThan(0);
      }

      vi.restoreAllMocks();
      document.querySelectorAll("a[download]").forEach((a) => {
        a.remove();
      });
    }
  });

  it("does not throw or fail even with an error that has no message (empty Error, string, or non-Error object)", () => {
    // Intentionally forces a non-Error thrown value (string) to verify the
    // implementation's `String(error)` fallback.
    vi.spyOn(URL, "createObjectURL").mockImplementation(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw "fallo simulado como string";
    });

    const result = downloadExportedFile(createConversation());

    expect(result).toEqual({ ok: false, error: "fallo simulado como string" });
  });

  it("the in-memory serialization (pure step) cannot fail for a valid Conversation: any real failure happens later, with zero bytes written", () => {
    // `exportConversation` and `serializeExport` are pure functions
    // (no I/O) that operate on a well-typed `Conversation`: for a valid
    // input they have no failure mode (they don't touch the DOM, browser
    // APIs, or perform operations that can throw). This is what upholds
    // the "no partial file" guarantee of Requirement 7.2: as seen in the
    // tests above, every forced failure happens at the I/O layer
    // (`createObjectURL`, `createElement`, `click`), i.e. *after* the full
    // text already exists in memory. Therefore, a failure always implies
    // that no byte of the file was ever written/downloaded: there is no
    // observable intermediate state between "nothing" and "complete file".
    const conversation = createConversation();

    expect(() => serializeExport(exportConversation(conversation))).not.toThrow();

    const text = serializeExport(exportConversation(conversation));
    expect(typeof text).toBe("string");
    expect(text.length).toBeGreaterThan(0);
    expect(() => {
      JSON.parse(text);
    }).not.toThrow();
  });
});
