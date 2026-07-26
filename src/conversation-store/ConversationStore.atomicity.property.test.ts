// Atomicity property test for storage failures of ConversationStoreDexie
// on fake-indexeddb.
// See .kiro/specs/asistente-ia-local/design.md ("Correctness Properties",
// Property 8) and requirements.md (5.2).
//
// Strategy: instead of modifying ConversationStore.ts, the failure of the
// underlying Dexie operation (`add`/`put`/`delete` of the `conversations`
// table) is forced by temporarily reassigning that method directly on the
// table instance accessed via the injectable `db` constructor parameter of
// `ConversationStoreDexie`. `db` is a private property at the TypeScript
// level, but it's still a regular JS property at runtime, so it's accessed
// via a controlled cast without touching production code.

import "fake-indexeddb/auto";
import { describe, it } from "vitest";
import fc from "fast-check";
import { ConversationStoreDexie } from "./ConversationStore";
import type { Conversation, Message } from "../types/models";

const messageArbitrary = fc.record({
  id: fc.uuid(),
  role: fc.constantFrom<Message["role"]>("user", "assistant"),
  content: fc.string(),
  timestamp: fc.integer(),
});

type Operation = "create" | "addMessage" | "delete";

interface Scenario {
  messagesPerSeedConversation: Message[][];
  operation: Operation;
  targetIndex: number;
  newMessage: Message;
}

/**
 * Generates a set of seed conversations (0 to 3, each with 0 to 3 messages)
 * along with a write operation to attempt. If there are no seed
 * conversations, the only possible operation is "create" (addMessage/delete
 * need an existing conversation as a target).
 */
const scenarioArbitrary: fc.Arbitrary<Scenario> = fc
  .array(fc.array(messageArbitrary, { maxLength: 3 }), { maxLength: 3 })
  .chain((messagesPerSeedConversation) => {
    const indices = messagesPerSeedConversation.map((_, i) => i);
    const operations: Operation[] = indices.length > 0 ? ["create", "addMessage", "delete"] : ["create"];

    return fc.record({
      messagesPerSeedConversation: fc.constant(messagesPerSeedConversation),
      operation: fc.constantFrom(...operations),
      targetIndex: indices.length > 0 ? fc.constantFrom(...indices) : fc.constant(-1),
      newMessage: messageArbitrary,
    });
  });

/** Access to the underlying Dexie table method that each operation invokes. */
function dexieMethodOf(operation: Operation): "add" | "put" | "delete" {
  switch (operation) {
    case "create":
      return "add";
    case "addMessage":
      return "put";
    case "delete":
      return "delete";
  }
}

/** Minimal type needed to access and patch the internal Dexie table. */
interface StoreWithInternalTable {
  db: {
    conversations: Record<"add" | "put" | "delete", (...args: unknown[]) => unknown>;
  };
}

describe("ConversationStoreDexie - atomicity property under storage failures", () => {
  // Feature: asistente-ia-local, Property 8: Atomicidad ante fallos de almacenamiento
  it("preserves the previous state of the ConversationStore when the underlying persistence of a write fails", async () => {
    await fc.assert(
      fc.asyncProperty(
        scenarioArbitrary,
        async ({ messagesPerSeedConversation, operation, targetIndex, newMessage }) => {
          const store = new ConversationStoreDexie();

          const seedConversations: Conversation[] = [];
          for (const messages of messagesPerSeedConversation) {
            const conversation = await store.createConversation();
            for (const message of messages) {
              await store.addMessage(conversation.id, message);
            }
            const updated = await store.getConversation(conversation.id);
            if (updated !== null) {
              seedConversations.push(updated);
            }
          }

          const targetConversation = targetIndex >= 0 ? seedConversations[targetIndex] : undefined;
          const targetId = targetConversation?.id ?? "id-inexistente";

          const stateBefore = await store.listConversations();

          const table = (store as unknown as StoreWithInternalTable).db.conversations;
          const method = dexieMethodOf(operation);
          const originalMethod = table[method];
          table[method] = () => Promise.reject(new Error("fallo forzado de almacenamiento"));

          let operationFailed = false;
          try {
            if (operation === "create") {
              await store.createConversation();
            } else if (operation === "addMessage") {
              await store.addMessage(targetId, newMessage);
            } else {
              await store.deleteConversation(targetId);
            }
          } catch {
            operationFailed = true;
          } finally {
            table[method] = originalMethod;
          }

          const stateAfter = await store.listConversations();

          return operationFailed && JSON.stringify(stateAfter) === JSON.stringify(stateBefore);
        },
      ),
      { numRuns: 100 },
    );
  });
});
