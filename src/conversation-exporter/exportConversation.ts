// Conversation_Exporter: pure export of a Conversation to the stable
// versioned file format and its serialization to text.
// See .kiro/specs/asistente-ia-local/design.md (section "Exportador_Conversaciones")
// and .kiro/specs/asistente-ia-local/requirements.md (7.1).

import type { ExportedFile, Conversation } from "../types/models";
import { lastActivityAt } from "../types/models";

/**
 * PURE function: converts a persisted `Conversation` to the exported file
 * format (stable versioned contract, `version: 1`), computing
 * `lastActivityAt` via the eponymous pure function in `models.ts`.
 */
export function exportConversation(c: Conversation): ExportedFile {
  return {
    version: 1,
    id: c.id,
    createdAt: c.createdAt,
    lastActivityAt: lastActivityAt(c),
    messages: c.messages.map((m) => ({
      role: m.role,
      content: m.content,
      timestamp: m.timestamp,
    })),
  };
}

/**
 * PURE function: serializes an `ExportedFile` to JSON text.
 */
export function serializeExport(e: ExportedFile): string {
  return JSON.stringify(e);
}
