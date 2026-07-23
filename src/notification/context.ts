import { createContext } from 'react'
import type { NewNotification } from './model.ts'

/** Shape of the value exposed by the notification context: the only
 * function any component needs in order to publish a message. */
export interface NotificationContextValue {
  showNotification: (message: NewNotification) => void
  dismissNotification: (id: string) => void
}

export const NotificationContext = createContext<NotificationContextValue | null>(
  null,
)
