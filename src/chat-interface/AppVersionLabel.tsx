// AppVersionLabel: presentation component of the Chat_Interface.
//
// Shows the build/release version (`APP_VERSION`, `src/app-state/appVersion.ts`)
// persistently in the header, next to `ActiveEngineIndicator`, so a deployed
// build can be identified at a glance.

import { APP_VERSION } from "../app-state/appVersion";
import "./AppVersionLabel.css";

export function AppVersionLabel() {
  return (
    <span className="app-version-label" aria-label={`Versión de la aplicación ${APP_VERSION}`}>
      v{APP_VERSION}
    </span>
  );
}
