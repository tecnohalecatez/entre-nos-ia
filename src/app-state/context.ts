// App_State: global application context.
// See .kiro/specs/asistente-ia-local/design.md ("Architecture", "Boot
// sequence") and requirements.md (1.3, 1.8, 8.1, 8.4, 8.5, 10.6).
//
// Exposes in a single place the state that the Chat_Interface needs to
// decide what to show: the compatibility result, whether Degraded_Mode is
// active (and why), the response-generation cycle (`GenerationState`), and
// the reactive conversation state.

import { createContext, type Dispatch } from "react";
import type { CompatibilityResult } from "../compatibility-detector/decide";
import type { GenerationState, GenerationEvent } from "../inference-engine/reduceGeneration";
import type { InferenceEngine } from "../inference-engine/InferenceEngine";
import type { ConversationManager } from "../conversation-manager/ConversationManager";
import type { Conversation, Message } from "../types/models";
import type { DegradedModeCause } from "./degradedMode";
import type { ModelLoadProgress } from "./modelLoadProgress";

export interface AppStateContextValue {
  /** Result of `decide()`, or `null` while the boot sequence hasn't produced it yet. */
  compatibility: CompatibilityResult | null;
  /** `true` while the boot sequence (detection, download, engine initialization) is in progress. */
  loading: boolean;
  /** Cause of Degraded_Mode, or `null` if it's not active. */
  degradedMode: DegradedModeCause | null;
  /** `true` once `InferenceEngine.initialize()` has resolved successfully. */
  engineReady: boolean;
  /**
   * Most recent model-loading progress reported by WebLLM during
   * `InferenceEngine.initialize()` (Requisito 2.2), or `null` before the
   * first report arrives (or once boot has moved past initialization).
   * Rendered by `ModelLoadProgressIndicator` in the loading screen.
   */
  modelLoadProgress: ModelLoadProgress | null;

  generationState: GenerationState;
  dispatchGeneration: Dispatch<GenerationEvent>;

  /** Instance of the Inference_Engine used by the app (see Requirements 4.1-4.9). */
  inferenceEngine: InferenceEngine;

  /** Instance of the Conversation_Manager (see Requirements 5.3, 5.6, 5.8). */
  conversationManager: ConversationManager;
  /** Most recently loaded conversation list, sorted descending by `lastActivityAt`. */
  conversations: Conversation[];
  /** Reloads `conversations` from the Conversation_Manager after a mutation (create/delete). */
  reloadConversations: () => Promise<void>;

  /**
   * Identifier of the conversation currently active in the Chat_Interface,
   * or `null` if none is selected (5.4, 5.5, 5.8). Unlike
   * `conversationManager.getActiveConversationId()` (a plain getter on the
   * class instance), this value is React state and therefore reactive: the
   * components that read it (`ConversationList`, `MessageHistory`) re-render
   * when it changes.
   */
  activeConversationId: string | null;
  /** Selects an existing conversation as active (5.5) and updates `activeConversationId`. */
  selectConversation: (conversationId: string) => void;
  /** Creates a new conversation, marks it active (5.6), and reloads `conversations`. */
  createConversation: () => Promise<Conversation>;
  /** Deletes a conversation (5.7) and reloads `conversations`, reflecting the 5.8 reselection in `activeConversationId`. */
  deleteConversation: (conversationId: string) => Promise<void>;
  /** Persists an imported conversation (7.3), marks it active, and reloads `conversations`. */
  importConversation: (conversation: Conversation) => Promise<void>;
  /**
   * Adds an already-built Message to an existing Conversation (5.1) and
   * reloads `conversations` so the Chat_Interface reflects the newly
   * persisted content. Used by the message-send flow (22.1) to persist both
   * the user's Message and the assistant's.
   */
  addMessage: (conversationId: string, message: Message) => Promise<void>;
}

export const AppStateContext = createContext<AppStateContextValue | null>(null);
