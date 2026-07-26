// Unit tests for ConversationManager over ConversationStoreDexie
// (fake-indexeddb, no mocks). See .kiro/specs/asistente-ia-local/design.md
// (section "Gestor_Conversaciones / Almacen_Conversaciones") and
// requirements.md (5.3, 5.6, 5.8).

import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { ConversationStoreDexie } from "../conversation-store/ConversationStore";
import { ConversationManager } from "./ConversationManager";
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

describe("ConversationManager", () => {
  beforeEach(() => {
    // fake-indexeddb does not isolate automatically between tests: the whole
    // database is cleared before each test.
    indexedDB.deleteDatabase("ConversationStore");
  });

  it("createConversation persists the conversation (unique id) and marks it as active", async () => {
    const store = new ConversationStoreDexie();
    const manager = new ConversationManager(store);

    const c1 = await manager.createConversation();
    expect(manager.getActiveConversationId()).toBe(c1.id);

    const c2 = await manager.createConversation();
    expect(c1.id).not.toBe(c2.id);
    expect(manager.getActiveConversationId()).toBe(c2.id);
  });

  it("loadConversations returns conversations sorted in descending order by lastActivityAt", async () => {
    const store = new ConversationStoreDexie();
    const manager = new ConversationManager(store);

    const older = await manager.createConversation();
    const recent = await manager.createConversation();
    await store.addMessage(older.id, createMessage({ timestamp: recent.createdAt - 1000 }));
    await store.addMessage(recent.id, createMessage({ timestamp: recent.createdAt + 1000 }));

    const list = await manager.loadConversations();
    expect(list.map((c) => c.id)).toEqual([recent.id, older.id]);
  });

  it("deleteConversation, when deleting the active one, selects the remaining conversation with the most recent lastActivityAt", async () => {
    const store = new ConversationStoreDexie();
    const manager = new ConversationManager(store);

    const first = await manager.createConversation();
    const second = await manager.createConversation();
    const third = await manager.createConversation();
    // The active one after creation is "third". We give "second" the most
    // recent activity among those that will remain after deleting "third".
    await store.addMessage(second.id, createMessage({ timestamp: third.createdAt + 1000 }));
    expect(manager.getActiveConversationId()).toBe(third.id);

    const resultingActive = await manager.deleteConversation(third.id);

    expect(resultingActive?.id).toBe(second.id);
    expect(manager.getActiveConversationId()).toBe(second.id);
    expect(first.id).not.toBe(second.id); // sanity: first remains not chosen
  });

  it("deleteConversation, when deleting the only active conversation, leaves no active conversation", async () => {
    const store = new ConversationStoreDexie();
    const manager = new ConversationManager(store);

    const only = await manager.createConversation();

    const resultingActive = await manager.deleteConversation(only.id);

    expect(resultingActive).toBeNull();
    expect(manager.getActiveConversationId()).toBeNull();
  });

  it("deleteConversation, when deleting a non-active conversation, does not change which one is active", async () => {
    const store = new ConversationStoreDexie();
    const manager = new ConversationManager(store);

    const first = await manager.createConversation();
    const second = await manager.createConversation();
    manager.selectConversation(first.id);

    const resultingActive = await manager.deleteConversation(second.id);

    expect(resultingActive?.id).toBe(first.id);
    expect(manager.getActiveConversationId()).toBe(first.id);
  });

  it("addMessage delegates to the ConversationStore without altering the active conversation (5.1)", async () => {
    const store = new ConversationStoreDexie();
    const manager = new ConversationManager(store);

    const conversation = await manager.createConversation();
    const message = createMessage({ content: "hola desde el gestor" });

    await manager.addMessage(conversation.id, message);

    const persisted = await store.getConversation(conversation.id);
    expect(persisted?.messages).toEqual([message]);
    expect(manager.getActiveConversationId()).toBe(conversation.id);
  });

  it("importConversation persists the imported conversation and marks it as active (7.3)", async () => {
    const store = new ConversationStoreDexie();
    const manager = new ConversationManager(store);

    const importedConversation = {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      messages: [createMessage({ content: "importado" })],
    };

    await manager.importConversation(importedConversation);

    expect(manager.getActiveConversationId()).toBe(importedConversation.id);
    const list = await manager.loadConversations();
    expect(list.map((c) => c.id)).toContain(importedConversation.id);
  });

  it("selectConversation explicitly updates the active conversation", async () => {
    const store = new ConversationStoreDexie();
    const manager = new ConversationManager(store);

    const first = await manager.createConversation();
    await manager.createConversation();

    manager.selectConversation(first.id);

    expect(manager.getActiveConversationId()).toBe(first.id);
  });
});
