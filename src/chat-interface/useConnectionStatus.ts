// useConnectionStatus: Chat_Interface hook (task 19.1).
//
// See .kiro/specs/asistente-ia-local/design.md ("Interfaz_Chat") and
// requirements.md (3.8).
//
// Exposes the browser's connectivity status (`navigator.onLine`)
// reactively, subscribing to the standard `online`/`offline` `window`
// events. Extracted as an independent hook (instead of living inside
// `OfflineStatusIndicator`) to keep the subscription logic separate from
// presentation and ease its testing/reuse.

import { useEffect, useState } from "react";

/** `true` while the browser reports having an internet connection. */
export function useConnectionStatus(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    function handleOnline() {
      setOnline(true);
    }

    function handleOffline() {
      setOnline(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return online;
}
