import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applyTheme, readStoredPreference, resolveTheme } from './theme/themePreference.ts'

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('No se encontró el elemento #root en el documento')
}

// Applied synchronously, before the first render, to avoid a flash of the
// wrong theme for users with a persisted "light"/"dark" preference: without
// this, the page would briefly show the OS default (via `ThemeProvider`'s
// first effect) before correcting itself. `ThemeProvider` re-applies the
// same resolved theme once mounted, keeping it in sync afterwards.
function readLocalStorageSafely(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

const systemPrefersDark =
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches
applyTheme(
  document.documentElement,
  resolveTheme(readStoredPreference(readLocalStorageSafely()), systemPrefersDark),
)

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Service_Worker_App registration (Requirement 3.1) happens inside the
// React tree, in `UpdateAvailableNotification` (mounted from `App.tsx`),
// because handling the update-available notification (9.1, 9.2, 9.6, task
// 19.2) needs access to `useNotification()` and `useAppState()`.
