// Property test for absence of content transmission over the network when
// running the full flow of sending a message, generating a response and
// persisting it.
// See .kiro/specs/asistente-ia-local/design.md (section "Correctness
// Properties", Property 10: "Absence of content transmission over network")
// and requirements.md (6.1, 6.2).

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fc from "fast-check";
import { installNetworkSpy, type NetworkSpy } from "./networkSpy";
import { reduceGeneration, type GenerationState } from "../inference-engine/reduceGeneration";
import type { InferenceEngine } from "../inference-engine/InferenceEngine";
import type { ConversationStore } from "../conversation-store/ConversationStore";
import type { Conversation, Message } from "../types/models";

/**
 * In-memory double of `ConversationStore`, with no access to IndexedDB
 * or the network: keeps conversations in a local `Map`.
 */
class InMemoryConversationStore implements ConversationStore {
  private readonly conversations = new Map<string, Conversation>();

  async createConversation(): Promise<Conversation> {
    const conversation: Conversation = {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      messages: [],
    };
    this.conversations.set(conversation.id, conversation);
    return Promise.resolve(conversation);
  }

  async addMessage(conversationId: string, message: Message): Promise<void> {
    const conversation = this.conversations.get(conversationId);
    if (conversation === undefined) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }
    this.conversations.set(conversationId, {
      ...conversation,
      messages: [...conversation.messages, message],
    });
    return Promise.resolve();
  }

  async deleteConversation(conversationId: string): Promise<void> {
    this.conversations.delete(conversationId);
    return Promise.resolve();
  }

  async listConversations(): Promise<Conversation[]> {
    return Promise.resolve(Array.from(this.conversations.values()));
  }

  async importConversation(conversation: Conversation): Promise<void> {
    this.conversations.set(conversation.id, conversation);
    return Promise.resolve();
  }

  async getConversation(conversationId: string): Promise<Conversation | null> {
    return Promise.resolve(this.conversations.get(conversationId) ?? null);
  }
}

/**
 * Double of `InferenceEngine` that never touches the network: it simply
 * returns the same content received in the last message of the history,
 * split into chunks, as the generated "response".
 */
class EchoInferenceEngine implements InferenceEngine {
  async initialize(): Promise<void> {
    return Promise.resolve();
  }

  generate(history: Message[]): AsyncIterable<string> {
    const lastMessage = history[history.length - 1];
    const content = lastMessage?.content ?? "";
    // The content is split into fixed-size chunks to simulate plausible
    // streaming without depending on a real engine.
    const chunkSize = 7;
    const chunks: string[] = [];
    for (let i = 0; i < content.length; i += chunkSize) {
      chunks.push(content.slice(i, i + chunkSize));
    }
    if (chunks.length === 0) {
      chunks.push("");
    }

    return (async function* generateChunks(): AsyncIterable<string> {
      // Explicit `await` to simulate the real asynchronous nature of
      // `InferenceEngine.generate()` (which awaits the creation of the
      // WebLLM stream before iterating it).
      await Promise.resolve();
      for (const chunk of chunks) {
        yield chunk;
      }
    })();
  }

  cancel(): void {
    // No-op: there is no real generation in flight to cancel.
  }
}

/**
 * Runs the full flow: create conversation, add the user message, generate
 * the assistant's response via `InferenceEngine` and persist the resulting
 * message via `ConversationStore`.
 */
async function runFullFlow(
  content: string,
  inferenceEngine: InferenceEngine,
  store: ConversationStore,
): Promise<void> {
  const conversation = await store.createConversation();

  const userMessage: Message = {
    id: crypto.randomUUID(),
    role: "user",
    content,
    timestamp: Date.now(),
  };
  await store.addMessage(conversation.id, userMessage);

  let state: GenerationState = {
    type: "generating",
    userMessage,
    partialText: "",
  };

  for await (const chunk of inferenceEngine.generate([userMessage])) {
    state = reduceGeneration(state, { type: "chunk", text: chunk });
  }
  state = reduceGeneration(state, { type: "complete" });

  if (state.type === "completed") {
    await store.addMessage(conversation.id, state.assistantMessage);
  }
}

const messageContentGenerator = fc.oneof(
  // "Usual" ASCII text (includes long text via fast-check's default maxLength).
  fc.string(),
  // Full Unicode: any printable grapheme, including graphemes that span
  // multiple code points (e.g. emojis).
  fc.string({ unit: "grapheme" }),
  // Any Unicode code point (0000-10FFFF), with no restriction to be
  // printable or to form visually distinct graphemes.
  fc.string({ unit: "binary" }),
  // Any character in the 0000-00FF range, including ASCII control
  // characters (0x00-0x1f, 0x7f-0x9f).
  fc.string({ unit: "binary-ascii" }),
);

describe("Absence of content transmission over network - full flow", () => {
  let networkSpy: NetworkSpy;

  beforeEach(() => {
    networkSpy = installNetworkSpy();
  });

  afterEach(() => {
    networkSpy.restore();
  });

  // Feature: asistente-ia-local, Property 10: Absence of content transmission over network
  it("does not produce any network invocation when running the message send, generate and persist flow", async () => {
    await fc.assert(
      fc.asyncProperty(messageContentGenerator, async (content) => {
        const inferenceEngine = new EchoInferenceEngine();
        const store = new InMemoryConversationStore();

        await runFullFlow(content, inferenceEngine, store);

        expect(networkSpy.requests).toHaveLength(0);
        expect(networkSpy.containsSubstring(content)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});
