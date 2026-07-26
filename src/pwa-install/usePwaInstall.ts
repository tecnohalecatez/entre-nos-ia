// Hook `usePwaInstall`: captures the `beforeinstallprompt` event and exposes
// the ability to install the application (task 20.3).
//
// See .kiro/specs/asistente-ia-local/design.md (section "Instalabilidad") and
// requirements.md (11.2, 11.3, 11.6).
//
// Responsibilities:
// - Listen for `beforeinstallprompt` on `window`, call `preventDefault()`
//   (to defer the browser's native prompt) and store the captured event
//   (11.2).
// - Expose `canInstall` (`true` only while there is a captured, unconsumed
//   event). If the browser never emits the event (because it does not
//   support installation or the installability criteria are not met),
//   `canInstall` remains `false` for the entire lifecycle of the component
//   using the hook, letting the consumer hide the install control (11.6).
// - Expose `install()`, which invokes the browser's installation mechanism
//   (`prompt()`), waits for the result (`userChoice`) and translates it to
//   "accepted" | "cancelled" (11.3). A captured `beforeinstallprompt` event
//   can only be used once: after calling `install()` (successfully or not)
//   the stored event is discarded, so a second call without a new
//   `beforeinstallprompt` is a no-op (returns `null`).
// - Listen for `appinstalled` to clear the captured event if the browser
//   reports the installation completed through a path other than this
//   hook's `install()` (e.g. the browser's own menu), preventing
//   `canInstall` from staying `true` for an already-installed app.

import { useCallback, useEffect, useRef, useState } from "react";

/** Install result, already translated to Spanish for display (11.3). */
export type InstallResult = "accepted" | "cancelled";

export interface UsePwaInstallResult {
  /** `true` while there is a captured, unconsumed `beforeinstallprompt` event (11.2, 11.6). */
  canInstall: boolean;
  /**
   * Invokes the browser's installation mechanism and waits for its result
   * (11.3). Returns `null` if there is no captured event (e.g. already
   * consumed, or the browser never emitted it).
   */
  install: () => Promise<InstallResult | null>;
}

/** Hook that captures and triggers the PWA install flow. */
export function usePwaInstall(): UsePwaInstallResult {
  const [canInstall, setCanInstall] = useState(false);
  const eventRef = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    function handleBeforeInstallPrompt(event: BeforeInstallPromptEvent): void {
      event.preventDefault();
      eventRef.current = event;
      setCanInstall(true);
    }

    function handleAppInstalled(): void {
      eventRef.current = null;
      setCanInstall(false);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const install = useCallback(async (): Promise<InstallResult | null> => {
    const event = eventRef.current;
    if (event === null) {
      return null;
    }

    // The captured event can only be used once: it is discarded immediately
    // so a second call to `install()` without a new `beforeinstallprompt`
    // is a no-op instead of retrying `prompt()` on an already-consumed
    // event.
    eventRef.current = null;
    setCanInstall(false);

    await event.prompt();
    const { outcome } = await event.userChoice;
    return outcome === "accepted" ? "accepted" : "cancelled";
  }, []);

  return { canInstall, install };
}
