// PwaInstallControl: install control for the ChatInterface (task 20.3).
// See .kiro/specs/asistente-ia-local/design.md (section "Instalabilidad") and
// requirements.md (11.2, 11.3, 11.6).
//
// Renders a button visible only while `usePwaInstall()` indicates there is
// a captured `beforeinstallprompt` event (11.2); if the browser does not
// support web app installation or never emits that event, `canInstall`
// remains `false` and this component renders nothing, allowing full use of
// the ChatInterface without showing the control (11.6). Activating the
// control invokes the browser's installation mechanism and shows the
// result (completed or cancelled) via the centralized notification
// mechanism (11.3).

import { usePwaInstall } from "./usePwaInstall";
import { useNotification } from "../notification/useNotification";

const ACCEPTED_TEXT = "Instalación completada";
const CANCELLED_TEXT = "Instalación cancelada";

export function PwaInstallControl() {
  const { canInstall, install } = usePwaInstall();
  const { showNotification } = useNotification();

  if (!canInstall) {
    return null;
  }

  async function handleInstall(): Promise<void> {
    const result = await install();
    if (result === null) {
      return;
    }

    showNotification({
      type: "info",
      text: result === "accepted" ? ACCEPTED_TEXT : CANCELLED_TEXT,
    });
  }

  return (
    <button type="button" className="pwa-install-control" onClick={() => void handleInstall()}>
      Instalar aplicación
    </button>
  );
}
