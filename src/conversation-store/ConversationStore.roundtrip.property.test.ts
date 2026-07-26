// Persistence round-trip property test for ConversationStoreDexie on
// fake-indexeddb.
// See .kiro/specs/asistente-ia-local/design.md (Property 7) and
// requirements.md (5.1, 5.5, 5.9).

import "fake-indexeddb/auto";
import { describe, it } from "vitest";
import fc from "fast-check";
import { ConversationStoreDexie } from "./ConversationStore";
import type { Message } from "../types/models";

const messageArbitrary = fc.record({
  id: fc.uuid(),
  role: fc.constantFrom<Message["role"]>("user", "assistant"),
  content: fc.string(),
  timestamp: fc.integer(),
});

describe("ConversationStoreDexie - round-trip property", () => {
  // Feature: asistente-ia-local, Property 7: Round-trip de persistencia en el Almacen_Conversaciones
  it("persists and retrieves a conversation with its messages exactly equal after simulating a reload", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(messageArbitrary), async (messages) => {
        const store = new ConversationStoreDexie();
        const conversation = await store.createConversation();

        for (const message of messages) {
          await store.addMessage(conversation.id, message);
        }

        // New store instance on the same fake-indexeddb backing store,
        // simulating an application reload. The database is not deleted
        // between iterations: each iteration uses a distinct conversation id
        // (crypto.randomUUID() in createConversation), so iterations don't
        // interfere with each other.
        const reloadedStore = new ConversationStoreDexie();
        const retrieved = await reloadedStore.getConversation(conversation.id);

        return (
          retrieved !== null &&
          retrieved.messages.length === messages.length &&
          retrieved.messages.every((m, i) => {
            const original = messages[i];
            if (original === undefined) {
              return false;
            }
            return (
              original.id === m.id &&
              original.role === m.role &&
              original.content === m.content &&
              original.timestamp === m.timestamp
            );
          })
        );
      }),
      { numRuns: 100 },
    );
  });
});
