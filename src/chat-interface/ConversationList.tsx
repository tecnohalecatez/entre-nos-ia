// Chat_Interface: `ConversationList` renders the list of existing
// conversations (already sorted descending by `lastActivityAt` by
// `ConversationManager.loadConversations()`), allows selecting an existing
// conversation, deleting it, creating a new one, and exporting/importing it
// as a JSON file (Requirement 7).
//
// See .kiro/specs/asistente-ia-local/design.md ("Gestor_Conversaciones /
// Almacen_Conversaciones", "Exportador_Conversaciones") and requirements.md
// (Requirement 5: 5.3, 5.4, 5.5, 5.6, 5.7, 5.8; Requirement 7: 7.1, 7.2, 7.3, 7.4).

import { useRef } from "react";
import type { ChangeEvent } from "react";
import { useAppState } from "../app-state/useAppState";
import { useNotification } from "../notification/useNotification";
import { downloadExportedFile } from "../conversation-exporter/downloadExportedFile";
import { readImportedFile } from "../conversation-exporter/readImportedFile";
import { lastActivityAt } from "../types/models";
import type { Conversation } from "../types/models";
import "./ConversationList.css";

/** Text shown when there's no saved conversation (Requirement 5.4). */
export const EMPTY_STATE_TEXT = "No tienes conversaciones guardadas";

/** Error messages shown in the centralized notification when importing (Requirement 7.4). */
const INVALID_JSON_ERROR_TEXT = "El archivo seleccionado no es un JSON válido.";
const INVALID_SCHEMA_ERROR_TEXT =
  "El archivo no tiene el formato esperado de una conversación exportada.";
const FILE_TOO_LARGE_ERROR_TEXT =
  "El archivo supera el tamaño máximo permitido para importar una conversación (10 MB).";

function formatLabel(conversation: Conversation): string {
  const firstUserMessage = conversation.messages.find((message) => message.role === "user");
  if (firstUserMessage !== undefined) {
    return firstUserMessage.content;
  }
  return new Date(lastActivityAt(conversation)).toLocaleString();
}

/**
 * Chat_Interface's conversation list. Shows the empty state (5.4) when
 * there are no conversations, and otherwise each conversation in the order
 * already provided by the global state (5.3), allowing selecting it (5.5),
 * deleting it (5.7, with the 5.8 reselection delegated to
 * `AppStateProvider`/`ConversationManager`), or creating a new one (5.6).
 */
export function ConversationList() {
  const {
    conversations,
    activeConversationId,
    selectConversation,
    createConversation,
    deleteConversation,
    importConversation,
  } = useAppState();
  const { showNotification } = useNotification();
  const importInputRef = useRef<HTMLInputElement>(null);

  async function handleCreateConversation(): Promise<void> {
    try {
      await createConversation();
    } catch {
      showNotification({
        type: "error",
        text: "No se pudo crear la conversación. Intenta de nuevo.",
      });
    }
  }

  async function handleDeleteConversation(conversationId: string): Promise<void> {
    try {
      await deleteConversation(conversationId);
    } catch {
      showNotification({
        type: "error",
        text: "No se pudo eliminar la conversación. Intenta de nuevo.",
      });
    }
  }

  /** Triggers the download of the exported file for `conversation` (7.1, 7.2). */
  function handleExportConversation(conversation: Conversation): void {
    const result = downloadExportedFile(conversation);
    if (!result.ok) {
      showNotification({
        type: "error",
        text: "No se pudo exportar la conversación. Intenta de nuevo.",
      });
    }
  }

  function handleImportClick(): void {
    importInputRef.current?.click();
  }

  /** Reads and parses the selected file and, if valid, persists it as a new conversation (7.3, 7.4). */
  async function handleFileSelected(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    // Allows re-selecting the same file on a later attempt.
    event.target.value = "";
    if (file === undefined) {
      return;
    }

    const result = await readImportedFile(file);
    if (!result.ok) {
      const errorTextByReason: Record<typeof result.error, string> = {
        invalid_json: INVALID_JSON_ERROR_TEXT,
        invalid_schema: INVALID_SCHEMA_ERROR_TEXT,
        file_too_large: FILE_TOO_LARGE_ERROR_TEXT,
      };
      showNotification({ type: "error", text: errorTextByReason[result.error] });
      return;
    }

    try {
      await importConversation(result.conversation);
    } catch {
      showNotification({
        type: "error",
        text: "No se pudo importar la conversación. Intenta de nuevo.",
      });
    }
  }

  return (
    <nav className="conversation-list" aria-label="Conversaciones">
      <div className="conversation-list__actions">
        <button
          type="button"
          className="button button--primary button--block"
          onClick={() => void handleCreateConversation()}
        >
          Nueva conversación
        </button>

        <button
          type="button"
          className="button button--secondary button--block"
          onClick={handleImportClick}
        >
          Importar conversación
        </button>
        <input
          ref={importInputRef}
          type="file"
          accept="application/json"
          aria-label="Importar conversación desde archivo"
          style={{ display: "none" }}
          onChange={(event) => void handleFileSelected(event)}
        />
      </div>

      {conversations.length === 0 ? (
        <p className="conversation-list__empty-state" data-testid="conversation-list-empty">
          {EMPTY_STATE_TEXT}
        </p>
      ) : (
        <ul className="conversation-list__items">
          {conversations.map((conversation) => (
            <li key={conversation.id} className="conversation-list__item">
              <button
                type="button"
                className="conversation-list__title"
                aria-current={conversation.id === activeConversationId}
                onClick={() => {
                  selectConversation(conversation.id);
                }}
              >
                {formatLabel(conversation)}
              </button>
              <div className="conversation-list__item-actions">
                <button
                  type="button"
                  className="button button--ghost button--sm"
                  aria-label={`Exportar conversación ${formatLabel(conversation)}`}
                  onClick={() => {
                    handleExportConversation(conversation);
                  }}
                >
                  Exportar
                </button>
                <button
                  type="button"
                  className="button button--danger button--sm"
                  aria-label={`Eliminar conversación ${formatLabel(conversation)}`}
                  onClick={() => {
                    void handleDeleteConversation(conversation.id);
                  }}
                >
                  Eliminar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}
