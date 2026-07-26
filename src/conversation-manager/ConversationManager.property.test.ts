// Property test for ConversationManager invariants over
// ConversationStoreDexie (fake-indexeddb, no mocks).
// See .kiro/specs/asistente-ia-local/design.md ("Correctness Properties",
// Property 9) and requirements.md (5.3, 5.6, 5.7, 5.8).
//
// Strategy: an arbitrary sequence of "create" / "delete" steps is generated
// (the "delete" index is reduced modulo the number of currently live
// conversations, so it always points at an existing conversation) and run
// sequentially against a real ConversationManager + ConversationStoreDexie
// instance, checking the four invariants (a)-(d) after each step. The
// database is cleared at the start of each property run (not just once per
// test file) so that the "remaining" conversations observed exactly match
// the ones created during that run.

import "fake-indexeddb/auto";
import { describe, it } from "vitest";
import fc from "fast-check";
import { ConversationStoreDexie } from "../conversation-store/ConversationStore";
import { ConversationManager } from "./ConversationManager";
import { lastActivityAt } from "../types/models";

type Step = { type: "create" } | { type: "delete"; rawIndex: number };

const stepArbitrary: fc.Arbitrary<Step> = fc.oneof(
  fc.constant<Step>({ type: "create" }),
  fc.nat().map((rawIndex): Step => ({ type: "delete", rawIndex })),
);

// Sequences of up to 15 steps: enough to exercise creations, interleaved
// deletions (including deleting the active one and deleting the only
// remaining one) without each property run becoming too slow over
// fake-indexeddb.
const sequenceArbitrary = fc.array(stepArbitrary, { minLength: 1, maxLength: 15 });

describe("ConversationManager - invariants property", () => {
  // Feature: asistente-ia-local, Property 9: Invariantes del Gestor_Conversaciones
  it("keeps unique ids, descending order by lastActivityAt, absence of deleted ones, and correct reselection of the active one", async () => {
    await fc.assert(
      fc.asyncProperty(sequenceArbitrary, async (sequence) => {
        // Isolation between property runs: fake-indexeddb does not clear
        // itself, and invariants (c)/(d) depend on the "remaining"
        // conversations being exactly the ones from this run.
        indexedDB.deleteDatabase("ConversationStore");

        const store = new ConversationStoreDexie();
        const manager = new ConversationManager(store);

        const createdIds: string[] = [];
        const liveIds: string[] = [];

        for (const step of sequence) {
          if (step.type === "create") {
            const conversation = await manager.createConversation();

            // (a) all generated identifiers are unique among themselves.
            if (createdIds.includes(conversation.id)) {
              return false;
            }
            createdIds.push(conversation.id);
            liveIds.push(conversation.id);
          } else {
            if (liveIds.length === 0) {
              // No existing conversation to delete: skip this step.
              continue;
            }

            const index = step.rawIndex % liveIds.length;
            const idToDelete = liveIds[index];
            if (idToDelete === undefined) {
              return false;
            }
            const wasActive = manager.getActiveConversationId() === idToDelete;

            const result = await manager.deleteConversation(idToDelete);
            liveIds.splice(index, 1);

            // (c) neither the deleted conversation nor its messages appear in
            // listConversations() nor in getConversation().
            const listAfterDelete = await manager.loadConversations();
            if (listAfterDelete.some((c) => c.id === idToDelete)) {
              return false;
            }
            if ((await store.getConversation(idToDelete)) !== null) {
              return false;
            }

            // (d) if the deleted one was active, the resulting one SHALL be
            // the one with the most recent lastActivityAt among the
            // remaining ones, or none if none remain.
            if (wasActive) {
              if (liveIds.length === 0) {
                if (result !== null || manager.getActiveConversationId() !== null) {
                  return false;
                }
              } else {
                let maxLastActivity = -Infinity;
                for (const id of liveIds) {
                  const conversation = await store.getConversation(id);
                  if (conversation === null) {
                    return false;
                  }
                  maxLastActivity = Math.max(maxLastActivity, lastActivityAt(conversation));
                }

                if (result === null || lastActivityAt(result) !== maxLastActivity) {
                  return false;
                }
                if (manager.getActiveConversationId() !== result.id) {
                  return false;
                }
              }
            }
          }

          // (b) loadConversations() SHALL always be sorted in descending
          // order by lastActivityAt.
          const list = await manager.loadConversations();
          for (let i = 0; i < list.length - 1; i++) {
            const current = list[i];
            const next = list[i + 1];
            if (current === undefined || next === undefined) {
              return false;
            }
            if (lastActivityAt(current) < lastActivityAt(next)) {
              return false;
            }
          }
        }

        return true;
      }),
      { numRuns: 100 },
    );
  });
});
