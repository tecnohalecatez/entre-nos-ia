// Shared data types and models for the Local AI Assistant.
// See .kiro/specs/asistente-ia-local/design.md (sections "Motor_Inferencia",
// "Gestor_Conversaciones / Almacen_Conversaciones", "Exportador_Conversaciones"
// and "Data Models") for the design detail of each type.

/** Role of the sender of a message within a conversation. */
export type MessageRole = "user" | "assistant";

/** Individual message within a conversation. */
export interface Message {
  /** UUID v4 */
  id: string;
  role: MessageRole;
  /**
   * 1..4000 characters for user messages (validated by `validateMessage`);
   * no strict limit for assistant responses.
   */
  content: string;
  /** epoch ms */
  timestamp: number;
}

/** Entity persisted in IndexedDB (`conversations` table). */
export interface Conversation {
  /** UUID v4 */
  id: string;
  /** epoch ms, assigned on creation */
  createdAt: number;
  /** insertion order == chronological order */
  messages: Message[];
}

/** Exported file format (stable versioned contract). */
export interface ExportedFile {
  version: 1;
  id: string;
  createdAt: number;
  lastActivityAt: number;
  messages: { role: MessageRole; content: string; timestamp: number }[];
}

/**
 * Metadata for the cached model version (persisted alongside
 * Cache_Modelo, e.g. in IndexedDB or a record within the cache itself).
 */
export interface CachedModelMetadata {
  /** e.g. "Llama-3.2-3B-Instruct-q4f16_1" */
  modelId: string;
  version: string;
  /** file path -> reference sha256 checksum */
  checksums: Record<string, string>;
  integrityVerified: boolean;
}

/**
 * PURE function: computes the last-activity timestamp of a conversation.
 * If it has messages, it's the timestamp of the last message (the most
 * recent by insertion order); if it has no messages, it's its creation date.
 */
export function lastActivityAt(conversation: Conversation): number {
  const { messages } = conversation;
  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : undefined;
  return lastMessage !== undefined ? lastMessage.timestamp : conversation.createdAt;
}
