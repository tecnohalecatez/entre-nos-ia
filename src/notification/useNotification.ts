import { useContext } from 'react'
import { NotificationContext } from './context.ts'
import type { NotificationContextValue } from './context.ts'

/** Access hook for the centralized notification mechanism. Any
 * component (storage, download, generation, import/
 * export, Service Worker) uses it to publish or dismiss messages
 * without duplicating error-presentation logic. */
export function useNotification(): NotificationContextValue {
  const context = useContext(NotificationContext)
  if (!context) {
    throw new Error(
      'useNotification() must be used within a <NotificationProvider>',
    )
  }
  return context
}
