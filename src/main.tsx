import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('No se encontró el elemento #root en el documento')
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Service_Worker_App registration (Requirement 3.1) happens inside the
// React tree, in `UpdateAvailableNotification` (mounted from `App.tsx`),
// because handling the update-available notification (9.1, 9.2, 9.6, task
// 19.2) needs access to `useNotification()` and `useAppState()`.
