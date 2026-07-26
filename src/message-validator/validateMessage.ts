// Input message validator for the Local AI Assistant.
// See .kiro/specs/asistente-ia-local/design.md (section "Validador de
// mensajes de entrada") for design details.

/**
 * Result of validating a user message's content before invoking the
 * Motor_Inferencia.
 */
export type ValidationResult =
  | { valid: true; normalizedContent: string }
  | { valid: false; reason: "empty" | "too_long" };

const MAX_LENGTH = 4000;

/**
 * PURE function: trims whitespace from both ends and determines whether the
 * resulting content is a valid user message.
 *
 * `valid === true` <=> `content.trim().length >= 1 && content.trim().length <= 4000`
 *
 * Requisitos 4.6 (empty message rejected) y 4.8 (length exceeded rejected).
 */
export function validateMessage(content: string): ValidationResult {
  const normalizedContent = content.trim();

  if (normalizedContent.length === 0) {
    return { valid: false, reason: "empty" };
  }

  if (normalizedContent.length > MAX_LENGTH) {
    return { valid: false, reason: "too_long" };
  }

  return { valid: true, normalizedContent };
}
