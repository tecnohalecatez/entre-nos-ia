// Example-based unit tests for storage error handling of
// ConversationStoreDexie on fake-indexeddb.
// See .kiro/specs/asistente-ia-local/requirements.md (5.2): on a storage
// error the System must inform the user via a message and preserve the
// previous state without applying partial changes.
//
// The property test of task 11.3
// (`ConversationStore.atomicity.property.test.ts`) already covers
// exhaustively, via fast-check, that the store's state remains unchanged
// after a forced failure in any of the write operations. This test focuses
// on the added value not explicitly covered there: that the operation's
// promise actually rejects (instead of resolving silently) and that the
// original error object propagates intact (same message) to the caller,
// which is the mechanism a higher layer (Notification) depends on to inform
// the user of the error.
//
// Same technique as task 11.3: the underlying Dexie table method
// (`add`/`put`/`delete`) is temporarily reassigned, accessed via the `db`
// property (private only at the TypeScript level) of ConversationStoreDexie,
// without modifying production code.

import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { ConversationStoreDexie } from "./ConversationStore";
import type { Message } from "../types/models";

function createMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: crypto.randomUUID(),
    role: "user",
    content: "hola",
    timestamp: Date.now(),
    ...overrides,
  };
}

/** Minimal type needed to access and patch the internal Dexie table. */
interface StoreWithInternalTable {
  db: {
    conversations: Record<"add" | "put" | "delete", (...args: unknown[]) => unknown>;
  };
}

function forceFailureOf(
  store: ConversationStoreDexie,
  method: "add" | "put" | "delete",
  errorMessage: string,
): () => void {
  const table = (store as unknown as StoreWithInternalTable).db.conversations;
  const original = table[method];
  table[method] = () => Promise.reject(new Error(errorMessage));
  return () => {
    table[method] = original;
  };
}

describe("ConversationStoreDexie - storage error handling", () => {
  beforeEach(() => {
    // fake-indexeddb does not isolate automatically between tests: the
    // whole database is cleared before each test.
    indexedDB.deleteDatabase("ConversationStore");
  });

  it("createConversation rejects the promise and propagates the original error when the underlying persistence fails", async () => {
    const store = new ConversationStoreDexie();
    const previousConversation = await store.createConversation();
    const stateBefore = await store.listConversations();

    const restore = forceFailureOf(store, "add", "fallo forzado de almacenamiento: add");
    try {
      await expect(store.createConversation()).rejects.toThrow("fallo forzado de almacenamiento: add");
    } finally {
      restore();
    }

    const stateAfter = await store.listConversations();
    expect(stateAfter).toEqual(stateBefore);
    expect(stateAfter.map((c) => c.id)).toEqual([previousConversation.id]);
  });

  it("addMessage rejects the promise and propagates the original error when the underlying persistence fails, without persisting the message", async () => {
    const store = new ConversationStoreDexie();
    const conversation = await store.createConversation();
    const existingMessage = createMessage({ content: "mensaje previo" });
    await store.addMessage(conversation.id, existingMessage);
    const stateBefore = await store.getConversation(conversation.id);

    const restore = forceFailureOf(store, "put", "fallo forzado de almacenamiento: put");
    try {
      await expect(
        store.addMessage(conversation.id, createMessage({ content: "nuevo mensaje" })),
      ).rejects.toThrow("fallo forzado de almacenamiento: put");
    } finally {
      restore();
    }

    const stateAfter = await store.getConversation(conversation.id);
    expect(stateAfter).toEqual(stateBefore);
    expect(stateAfter?.messages).toEqual([existingMessage]);
  });

  it("deleteConversation rejects the promise and propagates the original error when the underlying persistence fails, without deleting the conversation", async () => {
    const store = new ConversationStoreDexie();
    const conversation = await store.createConversation();
    const stateBefore = await store.listConversations();

    const restore = forceFailureOf(store, "delete", "fallo forzado de almacenamiento: delete");
    try {
      await expect(store.deleteConversation(conversation.id)).rejects.toThrow(
        "fallo forzado de almacenamiento: delete",
      );
    } finally {
      restore();
    }

    const stateAfter = await store.listConversations();
    expect(stateAfter).toEqual(stateBefore);
    expect(await store.getConversation(conversation.id)).toEqual(conversation);
  });
});
