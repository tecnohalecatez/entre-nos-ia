// Motor_Inferencia: bounds how much of a Conversation's history is actually
// sent on each request.
//
// `mapHistoryToOpenAi()` (`InferenceEngine.ts`) used to map the FULL history
// unconditionally, which grows unbounded with a Conversation's length. That
// silently outgrows the model's `context_window_size` (2048 tokens on the
// "compact" tier, `configuration.ts`) well before any error surfaces from
// WebLLM: the GPU is asked to hold and prefill an ever-larger KV cache,
// which is a real out-of-memory vector on memory-constrained devices (see
// design.md, "Motivación y umbral de 8 GB").
//
// PURE function: given a character budget (an ESTIMATE of the token budget,
// see `InferenceEngine.ts`'s `CHARS_PER_TOKEN_ESTIMATE` -- no tokenizer is
// available at this layer), keeps the most recent messages that fit,
// dropping older ones first (the ones least likely to still be relevant).
// The single most recent message is always kept even if it alone exceeds
// the budget: `validateMessage.ts` already caps a single message at 4000
// chars, and a request with a non-empty history but zero budget left would
// otherwise silently drop what the user just asked.

import type { Message } from "../types/models";

/**
 * Keeps the most recent messages from `history` whose combined content
 * length fits within `charBudget`, dropping the oldest ones first. Always
 * keeps at least the last message. Preserves chronological order.
 */
export function truncateHistory(history: Message[], charBudget: number): Message[] {
  if (history.length === 0) {
    return history;
  }

  const kept: Message[] = [];
  let remainingBudget = charBudget;

  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
    if (message === undefined) {
      continue;
    }
    const cost = message.content.length;

    if (kept.length === 0) {
      // Always keep the most recent message, even alone over budget.
      kept.unshift(message);
      remainingBudget -= cost;
      continue;
    }

    if (cost > remainingBudget) {
      break;
    }

    kept.unshift(message);
    remainingBudget -= cost;
  }

  return kept;
}
