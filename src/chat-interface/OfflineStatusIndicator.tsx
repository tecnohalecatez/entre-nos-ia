// OfflineStatusIndicator: presentation component of the Chat_Interface
// (task 19.1).
//
// See .kiro/specs/asistente-ia-local/design.md ("Interfaz_Chat") and
// requirements.md (3.8).
//
// Responsibility: visually indicate to the user, while the browser is
// offline, that the app is operating without a connection (3.8). The
// requirement only mandates an indicator while offline, so this component
// renders nothing while there's a connection.

import { useConnectionStatus } from "./useConnectionStatus";
import "./OfflineStatusIndicator.css";

export function OfflineStatusIndicator() {
  const online = useConnectionStatus();

  if (online) {
    return null;
  }

  return (
    <span className="offline-status-indicator" role="status">
      Sin conexión
    </span>
  );
}
