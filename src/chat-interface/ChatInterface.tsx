// ChatInterface: root layout assembling the Chat_Interface's components
// (task 20.1).
//
// See .kiro/specs/asistente-ia-local/design.md ("Interfaz_Chat") and
// requirements.md (Requirement 10: 10.1, 10.2, 10.3).
//
// Responsibility of this component: compose the blocks already built in
// earlier tasks -- conversation list (`ConversationList`, 17.1), message
// history (`MessageHistory`, 17.2), message input (`MessageInput`, 17.3),
// persistent indicators (`ActiveEngineIndicator`/`OfflineStatusIndicator`,
// 19.1), help section (`HelpSection`, 19.3) and install control
// (`PwaInstallControl`, 20.3) -- into a single structure. The responsive
// behavior required by Requirement 10 is provided by `ChatInterface.css`:
//
// - 10.1/10.2: at both mobile and desktop widths, the three regions
//   (message input, active conversation's history, conversation list)
//   remain accessible without horizontal scrolling -- side by side on
//   desktop, stacked on mobile.
// - 10.3: an orientation change readjusts the layout keeping the message
//   input and the most recent message visible. This is a pure CSS Flexbox
//   property (container height pinned to the viewport, history with
//   `overflow-y: auto` + `flex: 1 1 auto`, input with `flex: 0 0 auto`) and
//   doesn't require JavaScript logic to react to `orientationchange`: the
//   browser already recalculates that layout on every viewport resize.
//
// The full message-send flow (creating a Conversation if none exists,
// invoking the Inference_Engine, incremental streaming, persistence and
// retry after error) is orchestrated by `useSendMessage` (task 22.1). The
// rest of `MessageInput`'s behavior (live validation, disabling) is
// self-contained.

import { useState } from "react";
import { useAppState } from "../app-state/useAppState";
import { ConversationList } from "./ConversationList";
import { MessageHistory } from "./MessageHistory";
import { MessageInput } from "./MessageInput";
import { ActiveEngineIndicator } from "./ActiveEngineIndicator";
import { AppVersionLabel } from "./AppVersionLabel";
import { OfflineStatusIndicator } from "./OfflineStatusIndicator";
import { HelpSection } from "./HelpSection";
import { PwaInstallControl } from "../pwa-install/PwaInstallControl";
import { ThemeToggle } from "../theme";
import { useSendMessage } from "./useSendMessage";
import "./ChatInterface.css";

export function ChatInterface() {
  const { generationState, engineReady } = useAppState();
  const { sendMessage, retryMessage, inferenceEngineForCancel } = useSendMessage();
  const [helpVisible, setHelpVisible] = useState(false);

  return (
    <div className="chat-interface">
      <header className="chat-interface__header">
        <span className="chat-interface__brand">
          <span className="chat-interface__brand-icon" aria-hidden="true">
            ✨
          </span>
          Entre Nos IA
        </span>
        <div className="chat-interface__indicators">
          <ActiveEngineIndicator />
          <AppVersionLabel />
          <OfflineStatusIndicator />
          <PwaInstallControl />
        </div>
        <div className="chat-interface__header-actions">
          <ThemeToggle />
          <button
            type="button"
            className="chat-interface__help-button button button--ghost button--sm"
            aria-expanded={helpVisible}
            onClick={() => {
              setHelpVisible((visible) => !visible);
            }}
          >
            Ayuda
          </button>
        </div>
      </header>

      {helpVisible ? <HelpSection /> : null}

      <div className="chat-interface__body">
        <aside className="chat-interface__conversation-list">
          <ConversationList />
        </aside>

        <main className="chat-interface__main">
          <MessageHistory />
          <MessageInput
            generationState={generationState}
            engineReady={engineReady}
            inferenceEngine={inferenceEngineForCancel}
            onSend={(normalizedContent) => {
              void sendMessage(normalizedContent);
            }}
            onRetry={(userMessage) => {
              void retryMessage(userMessage);
            }}
          />
        </main>
      </div>
    </div>
  );
}
