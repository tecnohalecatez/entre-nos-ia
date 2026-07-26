// ConversationStore: local persistence of conversation history
// on IndexedDB via Dexie.js.
// See .kiro/specs/asistente-ia-local/design.md (section "Gestor_Conversaciones /
// Almacen_Conversaciones") for the design detail and
// .kiro/specs/asistente-ia-local/requirements.md (5.1, 5.6, 5.7, 5.9).

import Dexie, { type EntityTable } from "dexie";
import type { Conversation, Message } from "../types/models";
import { lastActivityAt } from "../types/models";

/** Contract of the ConversationStore (see design.md). */
export interface ConversationStore {
  createConversation(): Promise<Conversation>;
  addMessage(conversationId: string, message: Message): Promise<void>;
  deleteConversation(conversationId: string): Promise<void>;
  /** descending order by lastActivityAt */
  listConversations(): Promise<Conversation[]>;
  getConversation(conversationId: string): Promise<Conversation | null>;
  /**
   * Persists an already fully-formed `Conversation` (e.g. produced by
   * `parsearImportacion()`, with its own new id and its messages already
   * built) as-is, without recreating it message by message through
   * `createConversation`/`addMessage` (Requisito 7.3).
   */
  importConversation(conversation: Conversation): Promise<void>;
}

/**
 * Dexie database for the ConversationStore.
 *
 * Dexie indexes: `conversations` indexed by `id` (primary key).
 * `lastActivityAt` is NOT stored as its own field/index: it is computed in
 * memory (via `lastActivityAt()` from `src/types/models.ts`) at the moment of
 * `listConversations()`, to avoid desync between the stored field and the
 * actual content of `messages` (see design.md).
 */
class ConversationStoreDB extends Dexie {
  conversations!: EntityTable<Conversation, "id">;

  constructor() {
    super("ConversationStore");
    this.version(1).stores({
      conversations: "id",
    });
  }
}

/**
 * Implementation of `ConversationStore` on top of Dexie.
 *
 * Each write operation (`createConversation`, `addMessage`,
 * `deleteConversation`) runs inside `db.transaction('rw', ...)`: if the
 * transaction promise rejects, Dexie rolls back all changes from that
 * transaction automatically, which provides the atomicity property required
 * by Requisito 5.2.
 */
export class ConversationStoreDexie implements ConversationStore {
  private readonly db: ConversationStoreDB;

  constructor(db: ConversationStoreDB = new ConversationStoreDB()) {
    this.db = db;
  }

  async createConversation(): Promise<Conversation> {
    const conversation: Conversation = {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      messages: [],
    };

    await this.db.transaction("rw", this.db.conversations, async () => {
      await this.db.conversations.add(conversation);
    });

    return conversation;
  }

  async addMessage(conversationId: string, message: Message): Promise<void> {
    await this.db.transaction("rw", this.db.conversations, async () => {
      const conversation = await this.db.conversations.get(conversationId);
      if (conversation === undefined) {
        throw new Error(`Conversation not found: ${conversationId}`);
      }
      const updated: Conversation = {
        ...conversation,
        messages: [...conversation.messages, message],
      };
      await this.db.conversations.put(updated);
    });
  }

  async deleteConversation(conversationId: string): Promise<void> {
    await this.db.transaction("rw", this.db.conversations, async () => {
      await this.db.conversations.delete(conversationId);
    });
  }

  async importConversation(conversation: Conversation): Promise<void> {
    await this.db.transaction("rw", this.db.conversations, async () => {
      await this.db.conversations.add(conversation);
    });
  }

  async listConversations(): Promise<Conversation[]> {
    const conversations = await this.db.conversations.toArray();
    return conversations.sort((a, b) => lastActivityAt(b) - lastActivityAt(a));
  }

  async getConversation(conversationId: string): Promise<Conversation | null> {
    const conversation = await this.db.conversations.get(conversationId);
    return conversation ?? null;
  }
}
