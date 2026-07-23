// Conversation_Exporter: browser file-import flow (I/O layer on top of the
// pure function `parseImport`).
// See .kiro/specs/asistente-ia-local/design.md (section "Exportador_Conversaciones")
// and .kiro/specs/asistente-ia-local/requirements.md (7.2, 7.3, 7.4).

import { parseImport, type ImportResult } from "./parseImport";

/**
 * Reads the text content of a `File` selected/dropped by the user and
 * parses it via `parseImport`. Never throws an exception to the caller: a
 * file that cannot be read is reported with the same error as invalid JSON
 * (`"invalid_json"`), since in both cases a valid `Conversation` could not
 * be obtained from the file (7.4).
 */
export async function readImportedFile(file: File): Promise<ImportResult> {
  let text: string;
  try {
    text = await file.text();
  } catch {
    return { ok: false, error: "invalid_json" };
  }

  return parseImport(text);
}
