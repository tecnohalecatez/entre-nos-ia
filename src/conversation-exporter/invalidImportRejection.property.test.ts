// Invalid-import-rejection property test for `parseImport()`.
// See .kiro/specs/asistente-ia-local/design.md (section "Correctness Properties",
// Property 12) and .kiro/specs/asistente-ia-local/requirements.md (7.4).
//
// `parseImport` is a PURE function with no reference whatsoever to the
// Almacen_Conversaciones: it never reads or writes it. Therefore, the part
// of Property 12 about "the Almacen_Conversaciones remains unchanged" is
// trivially guaranteed at this level (the function never invokes the
// store). What is verified here is the part observable at this function's
// level: for any text that is not valid JSON, or that is valid JSON but
// does not satisfy the required schema, `parseImport` SHALL return
// `{ ok: false, ... }` and never throw an exception.
import { describe, expect, it } from "vitest";
import fc from "fast-check";

import { parseImport } from "./parseImport";

// Generator of almost-certainly-non-JSON strings: the few cases that
// happen to be valid JSON (e.g. "1", "null", '"a"') are filtered out.
const nonJsonTextArbitrary = fc.string({ minLength: 1, maxLength: 50 }).filter((s) => {
  try {
    JSON.parse(s);
    return false;
  } catch {
    return true;
  }
});

// Generator of potentially-invalid "messages": each field may be missing
// or have the wrong type.
const corruptibleMessageArbitrary = fc.record({
  role: fc.oneof(fc.constantFrom("user", "assistant"), fc.string(), fc.integer(), fc.constant(undefined)),
  content: fc.oneof(fc.string(), fc.integer(), fc.constant(undefined)),
  timestamp: fc.oneof(fc.integer(), fc.string(), fc.constant(undefined)),
});

// Generator of "imported file" objects where each required field (id,
// createdAt, messages) may be missing or have an invalid type/shape.
// The case where EVERYTHING is valid is deliberately excluded, to
// guarantee that the generated object always violates the schema.
const invalidSchemaObjectArbitrary = fc
  .record({
    id: fc.oneof(fc.string(), fc.integer(), fc.constant(undefined)),
    createdAt: fc.oneof(fc.integer(), fc.string(), fc.constant(undefined)),
    messages: fc.oneof(
      fc.array(corruptibleMessageArbitrary, { maxLength: 5 }),
      fc.string(),
      fc.integer(),
      fc.constant(undefined),
    ),
  })
  .filter((obj) => {
    const idValid = typeof obj.id === "string";
    const createdAtValid = typeof obj.createdAt === "number";
    const messagesValid =
      Array.isArray(obj.messages) &&
      obj.messages.every(
        (m) =>
          (m.role === "user" || m.role === "assistant") &&
          typeof m.content === "string" &&
          typeof m.timestamp === "number",
      );
    // Discard the one "everything valid" case to ensure the generated
    // object actually violates the required schema.
    return !(idValid && createdAtValid && messagesValid);
  });

describe("parseImport - invalid import rejection", () => {
  // Feature: asistente-ia-local, Property 12: Rechazo de importación inválida sin modificar el almacén
  it("returns ok: false and never throws for texts that are not valid JSON", () => {
    fc.assert(
      fc.property(nonJsonTextArbitrary, (text) => {
        const result = parseImport(text);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toBe("invalid_json");
        }
      }),
      { numRuns: 100 },
    );
  });

  // Feature: asistente-ia-local, Property 12: Rechazo de importación inválida sin modificar el almacén
  it("returns ok: false and never throws for valid JSON that does not satisfy the required schema", () => {
    fc.assert(
      fc.property(invalidSchemaObjectArbitrary, (obj) => {
        const result = parseImport(JSON.stringify(obj));
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toBe("invalid_schema");
        }
      }),
      { numRuns: 100 },
    );
  });
});
