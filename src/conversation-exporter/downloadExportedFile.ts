// Conversation_Exporter: browser file-export flow (I/O layer on top of the
// pure functions `exportConversation` and `serializeExport`).
// See .kiro/specs/asistente-ia-local/design.md (section "Exportador_Conversaciones",
// "Error Handling" table: "Fallo de escritura al exportar (7.2)")
// and .kiro/specs/asistente-ia-local/requirements.md (7.2).

import type { Conversation } from "../types/models";
import { exportConversation, serializeExport } from "./exportConversation";

/**
 * Typed result of `downloadExportedFile`: no exception is ever thrown to
 * the caller, errors are reported as `ok: false` (consistent with
 * `ImportResult` from `parseImport.ts`).
 */
export type ExportFileResult = { ok: true } | { ok: false; error: string };

function exportedFileName(conversation: Conversation): string {
  return `conversacion-${conversation.id}.json`;
}

/**
 * Triggers the download of a `.json` file in the browser with the exported
 * content of `conversation`.
 *
 * The full text is serialized in memory (`serializeExport`) *before*
 * creating the Blob and starting any interaction with the DOM or the
 * browser's download API. This guarantees that, in the face of any write
 * failure (an exception building the Blob, the object URL, or the anchor
 * element), the download never actually started: no partial or corrupt
 * file can be left behind (Requirement 7.2), the error is only reported via
 * `{ ok: false, error }`.
 */
export function downloadExportedFile(conversation: Conversation): ExportFileResult {
  // Full serialization in memory before touching the DOM or the download
  // API: if this fails, no file write was ever started.
  const text = serializeExport(exportConversation(conversation));

  try {
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    try {
      const link = document.createElement("a");
      link.href = url;
      link.download = exportedFileName(conversation);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } finally {
      URL.revokeObjectURL(url);
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
