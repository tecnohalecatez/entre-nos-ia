// Property-based round-trip test for exporting and importing conversations
// (Property 11). Combines `exportConversation()` + `serializeExport()`
// (7.1) with `parseImport()` (7.3) over randomly generated valid
// conversations.
// See .kiro/specs/asistente-ia-local/design.md (section "Exportador_Conversaciones"
// and "Correctness Properties", Property 11) and
// .kiro/specs/asistente-ia-local/requirements.md (7.1, 7.3, 7.5).
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Conversation } from "../types/models";
import { exportConversation, serializeExport } from "./exportConversation";
import { parseImport } from "./parseImport";

const conversationArbitrary: fc.Arbitrary<Conversation> = fc.record({
  id: fc.uuid(),
  createdAt: fc.integer(),
  messages: fc.array(
    fc.record({
      id: fc.uuid(),
      role: fc.constantFrom("user", "assistant"),
      content: fc.string(),
      timestamp: fc.integer(),
    }),
  ),
});

describe("export/import round-trip", () => {
  // Feature: asistente-ia-local, Property 11: Round-trip de exportación e importación de conversaciones
  it("produces a conversation with the same messages (order, role, content, timestamp) and an id different from the original", () => {
    fc.assert(
      fc.property(conversationArbitrary, (originalConversation) => {
        const exported = exportConversation(originalConversation);
        const text = serializeExport(exported);
        const result = parseImport(text);

        expect(result.ok).toBe(true);
        if (!result.ok) {
          return;
        }

        expect(result.conversation.id).not.toBe(originalConversation.id);

        expect(result.conversation.messages.map((m) => ({ role: m.role, content: m.content, timestamp: m.timestamp }))).toEqual(
          originalConversation.messages.map((m) => ({ role: m.role, content: m.content, timestamp: m.timestamp })),
        );
      }),
      { numRuns: 100 },
    );
  });
});
