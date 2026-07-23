// Root component of the app (task 16.1).
//
// Wraps the app in `NotificationProvider` (single point for presenting
// errors, task 16.2) and in `AppStateProvider` (global state/boot
// orchestration context, see `src/app-state/`).
//
// Renders the Degraded_Mode message when appropriate (1.3, 1.8, 8.1, 8.4,
// 8.5, 10.6); otherwise, the assembled Chat_Interface (`ChatInterface`,
// task 20.1) with its responsive layout (Requirement 10).
//
// `UpdateAvailableNotification` (task 19.2) is always mounted, regardless of
// `degradedMode`/`loading` state: a new Service_Worker_App version can be
// detected even while the assistant is in Degraded_Mode or still
// initializing (9.1).

import { NotificationProvider } from "./notification";
import { AppStateProvider } from "./app-state/AppStateProvider";
import { useAppState } from "./app-state/useAppState";
import { degradedModeMessage } from "./app-state/degradedMode";
import { UpdateAvailableNotification } from "./service-worker-app/UpdateAvailableNotification";
import { ChatInterface } from "./chat-interface/ChatInterface";
import "./App.css";

function AppContent() {
  const { degradedMode, loading } = useAppState();

  return (
    <>
      <UpdateAvailableNotification />
      {degradedMode !== null ? (
        <section id="degraded-mode" className="state-screen state-screen--degraded" role="alert">
          <div className="state-screen__content">
            <span className="state-screen__icon" aria-hidden="true">
              ⚠️
            </span>
            <h1>Asistente no disponible</h1>
            <p className="state-screen__text">{degradedModeMessage(degradedMode)}</p>
          </div>
        </section>
      ) : loading ? (
        <section id="loading" className="state-screen state-screen--loading">
          <div className="state-screen__content">
            <span className="state-screen__icon" aria-hidden="true">
              ✨
            </span>
            <h1>Preparando el asistente…</h1>
            <p className="state-screen__text">
              Estamos cargando el modelo de IA directamente en tu navegador. La primera vez puede tardar un poco;
              después queda listo al instante.
            </p>
            <div className="state-screen__progress-bar" role="progressbar" aria-label="Preparando el asistente…" />
          </div>
        </section>
      ) : (
        <ChatInterface />
      )}
    </>
  );
}

function App() {
  return (
    <NotificationProvider>
      <AppStateProvider>
        <AppContent />
      </AppStateProvider>
    </NotificationProvider>
  );
}

export default App;
