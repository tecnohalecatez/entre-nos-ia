// MessageHistory: presentation component of the Chat_Interface (task 17.2).
//
// See .kiro/specs/asistente-ia-local/design.md ("Interfaz_Chat") and
// requirements.md (4.2, 5.5).
//
// Responsibilities:
// - Show the active Conversation's `Message`s sorted ascending by their
//   timestamp (5.5). `Conversation.messages` is already persisted in
//   insertion order == chronological order (see
//   `ConversationStore`/`types/models.ts`), so rendering the array as-is
//   already satisfies the requirement; still, it's sorted explicitly and
//   defensively here so the component doesn't depend on that invariant
//   always holding at the data source.
// - Show the in-progress response's chunks incrementally while
//   `GenerationState.type === "generating"` (4.2). The incremental text
//   (`partialText`) is read from `AppStateContext`; since React re-renders
//   the component on every state update and `partialText` grows with every
//   `"chunk"` event processed by `reduceGeneration()`, simply rendering the
//   current value on every render already produces the required incremental
//   display, without needing any extra "streaming" animation/mechanism in
//   the UI.
//
// The active conversation is resolved from `activeConversationId` and
// `conversations` (both reactive in `AppStateContext`, see task 17.1),
// rather than received as a prop, so the component stays consistent with
// the rest of the Chat_Interface without extra wiring.
//
// Design note (task 22.1): when `GenerationState.type === "cancelled"`, the
// retained partial text (`retainedPartialText`, Property 5) is persisted as
// a real conversation `Message` (Requirement 4.5) by the send flow
// orchestrated in `useSendMessage.ts`. That's why this component does NOT
// render an extra ephemeral bubble for that state (unlike "generating",
// whose `partialText` is necessarily ephemeral while generation is in
// progress): once `reloadConversations()` reflects the newly persisted
// `Message`, also showing it as an ephemeral bubble would duplicate the
// content on screen during the brief window between the `"cancel"` dispatch
// and that persistence resolving.

import { useAppState } from "../app-state/useAppState";
import type { Message } from "../types/models";
import "./MessageHistory.css";

/** Sorts a copy of `messages` ascending by `timestamp` (5.5). */
function sortByTimestampAscending(messages: Message[]): Message[] {
  return [...messages].sort((a, b) => a.timestamp - b.timestamp);
}

export function MessageHistory() {
  const { generationState, conversations, activeConversationId } = useAppState();

  const conversation =
    activeConversationId !== null
      ? conversations.find((candidate) => candidate.id === activeConversationId) ?? null
      : null;

  if (conversation === null) {
    return (
      <section
        className="message-history message-history--empty"
        aria-label="Historial de mensajes"
      >
        <p className="message-history__empty-state">
          Seleccioná o creá una conversación para comenzar.
        </p>
      </section>
    );
  }

  const sortedMessages = sortByTimestampAscending(conversation.messages);

  return (
    <section
      className="message-history"
      role="log"
      aria-live="polite"
      aria-label="Historial de mensajes"
    >
      {sortedMessages.map((message) => (
        <article
          key={message.id}
          className={`message-history__message message-history__message--${message.role}`}
        >
          <p className="message-history__content">{message.content}</p>
        </article>
      ))}

      {generationState.type === "generating" ? (
        <article
          className="message-history__message message-history__message--assistant message-history__message--generating"
          aria-label="Generando respuesta"
        >
          <p className="message-history__content">{generationState.partialText}</p>
        </article>
      ) : null}
    </section>
  );
}
