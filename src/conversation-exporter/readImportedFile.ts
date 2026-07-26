// Conversation_Exporter: browser file-import flow (I/O layer on top of the
// pure function `parseImport`).
// See .kiro/specs/asistente-ia-local/design.md (section "Exportador_Conversaciones")
// and .kiro/specs/asistente-ia-local/requirements.md (7.2, 7.3, 7.4).

import { parseImport, type ImportResult } from "./parseImport";

/**
 * Upper bound on the size of a file accepted for import, enforced *before*
 * reading its content into memory. Without this, a crafted "conversation
 * backup" file with an enormous `messages` array or huge `content` strings
 * would be read in full (`file.text()`) and `JSON.parse`d regardless of
 * size, letting a malicious file the user is tricked into importing
 * freeze/crash their own tab (client-side denial of service). 10 MB is
 * generously above any realistic legitimate export -- even thousands of
 * messages of several KB each stay well under it.
 */
export const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024;

/**
 * Reads the text content of a `File` selected/dropped by the user and
 * parses it via `parseImport`. Never throws an exception to the caller: a
 * file that cannot be read is reported with the same error as invalid JSON
 * (`"invalid_json"`), since in both cases a valid `Conversation` could not
 * be obtained from the file (7.4). A file over `maxBytes` is rejected
 * up front, without ever reading its content, as `"file_too_large"`.
 */
export async function readImportedFile(
  file: File,
  maxBytes: number = MAX_IMPORT_FILE_BYTES,
): Promise<ImportResult> {
  if (file.size > maxBytes) {
    return { ok: false, error: "file_too_large" };
  }

  let text: string;
  try {
    text = await file.text();
  } catch {
    return { ok: false, error: "invalid_json" };
  }

  return parseImport(text);
}
