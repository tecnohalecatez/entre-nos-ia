// Unit tests for ConversationStoreDexie on fake-indexeddb.
// See .kiro/specs/asistente-ia-local/design.md (section "Gestor_Conversaciones /
// Almacen_Conversaciones") and requirements.md (5.1, 5.6, 5.7, 5.9).

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

describe("ConversationStoreDexie", () => {
  beforeEach(() => {
    // fake-indexeddb does not isolate automatically between tests: the
    // whole database is cleared before each test.
    indexedDB.deleteDatabase("ConversationStore");
  });

  it("createConversation persists an empty conversation with a unique id and createdAt", async () => {
    const store = new ConversationStoreDexie();

    const c1 = await store.createConversation();
    const c2 = await store.createConversation();

    expect(c1.id).not.toBe(c2.id);
    expect(c1.messages).toEqual([]);
    expect(typeof c1.createdAt).toBe("number");

    const list = await store.listConversations();
    expect(list).toHaveLength(2);
  });

  it("addMessage persists the message along with its role and timestamp", async () => {
    const store = new ConversationStoreDexie();
    const conversation = await store.createConversation();
    const message = createMessage({ role: "assistant", content: "respuesta" });

    await store.addMessage(conversation.id, message);

    const retrieved = await store.getConversation(conversation.id);
    expect(retrieved?.messages).toEqual([message]);
  });

  it("addMessage preserves insertion order across multiple calls", async () => {
    const store = new ConversationStoreDexie();
    const conversation = await store.createConversation();
    const m1 = createMessage({ content: "primero", timestamp: 1 });
    const m2 = createMessage({ content: "segundo", timestamp: 2 });

    await store.addMessage(conversation.id, m1);
    await store.addMessage(conversation.id, m2);

    const retrieved = await store.getConversation(conversation.id);
    expect(retrieved?.messages).toEqual([m1, m2]);
  });

  it("deleteConversation deletes the conversation and it stops appearing in listConversations/getConversation", async () => {
    const store = new ConversationStoreDexie();
    const conversation = await store.createConversation();

    await store.deleteConversation(conversation.id);

    expect(await store.getConversation(conversation.id)).toBeNull();
    expect(await store.listConversations()).toEqual([]);
  });

  it("listConversations orders descending by lastActivityAt", async () => {
    const store = new ConversationStoreDexie();
    const old = await store.createConversation();
    const recent = await store.createConversation();

    // The "old" conversation receives a message with a timestamp lower than
    // the creation date of "recent", and "recent" receives one with a
    // higher timestamp, so the expected order is [recent, old].
    await store.addMessage(old.id, createMessage({ timestamp: recent.createdAt - 1000 }));
    await store.addMessage(recent.id, createMessage({ timestamp: recent.createdAt + 1000 }));

    const list = await store.listConversations();
    expect(list.map((c) => c.id)).toEqual([recent.id, old.id]);
  });

  it("importConversation persists an already-formed conversation as-is (7.3)", async () => {
    const store = new ConversationStoreDexie();
    const message = createMessage({ content: "importado" });
    const importedConversation = {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      messages: [message],
    };

    await store.importConversation(importedConversation);

    const retrieved = await store.getConversation(importedConversation.id);
    expect(retrieved).toEqual(importedConversation);
  });

  it("getConversation returns null if the conversation doesn't exist", async () => {
    const store = new ConversationStoreDexie();
    expect(await store.getConversation("inexistente")).toBeNull();
  });

  it("preserves the full content of a conversation across a new instance (simulates a reload)", async () => {
    const store = new ConversationStoreDexie();
    const conversation = await store.createConversation();
    const message = createMessage();
    await store.addMessage(conversation.id, message);

    // New store instance on the same IndexedDB backing store, simulating an
    // application reload.
    const reloadedStore = new ConversationStoreDexie();
    const retrieved = await reloadedStore.getConversation(conversation.id);

    expect(retrieved).toEqual({ ...conversation, messages: [message] });
  });
});
