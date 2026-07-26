// Conversation_Exporter: pure import of an `ExportedFile` serialized to
// text, with schema validation and generation of a new identifier for the
// resulting Conversation.
// See .kiro/specs/asistente-ia-local/design.md (section "Exportador_Conversaciones")
// and .kiro/specs/asistente-ia-local/requirements.md (7.3, 7.4).

import type { Conversation, Message, MessageRole } from "../types/models";

/**
 * Typed result of `parseImport`: no exception is ever thrown, errors are
 * reported as `ok: false` (7.4).
 */
export type ImportResult =
  | { ok: true; conversation: Conversation }
  | { ok: false; error: "invalid_json" | "invalid_schema" | "file_too_large" };

function isValidRole(value: unknown): value is MessageRole {
  return value === "user" || value === "assistant";
}

interface ValidImportedMessage {
  role: MessageRole;
  content: string;
  timestamp: number;
}

function isValidMessage(value: unknown): value is ValidImportedMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const m = value as Record<string, unknown>;
  return isValidRole(m.role) && typeof m.content === "string" && typeof m.timestamp === "number";
}

interface ValidImportedFile {
  id: string;
  createdAt: number;
  messages: ValidImportedMessage[];
}

function isValidSchema(value: unknown): value is ValidImportedFile {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.createdAt === "number" &&
    Array.isArray(v.messages) &&
    v.messages.every(isValidMessage)
  );
}

/**
 * PURE function: parses the text of a previously exported file (in the
 * `ExportedFile` format) and builds a new `Conversation` with a NEW
 * identifier, distinct from the one in the imported file (7.3), preserving
 * the order, role, content and timestamp of each message.
 *
 * Never throws: parsing or schema failures are reported as
 * `{ ok: false, error: ... }` (7.4).
 */
export function parseImport(text: string): ImportResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: "invalid_json" };
  }

  if (!isValidSchema(data)) {
    return { ok: false, error: "invalid_schema" };
  }

  const messages: Message[] = data.messages.map((m) => ({
    id: crypto.randomUUID(),
    role: m.role,
    content: m.content,
    timestamp: m.timestamp,
  }));

  const conversation: Conversation = {
    id: crypto.randomUUID(),
    createdAt: data.createdAt,
    messages,
  };

  return { ok: true, conversation };
}
