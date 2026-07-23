import { useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { NotificationContext } from './context.ts'
import { Notification } from './Notification.tsx'
import type { NotificationMessage, NewNotification } from './model.ts'

let idCounter = 0

/** Generates a simple unique identifier for each notification.
 * `crypto.randomUUID()` is not used so as to keep the mechanism
 * deterministic and free of environment dependencies in tests. */
function generateId(): string {
  idCounter += 1
  return `notification-${idCounter.toString()}`
}

export interface NotificationProviderProps {
  children: ReactNode
}

/** Single provider for the centralized notification mechanism. It is
 * mounted once near the root of the application; any descendant
 * component can publish notifications via `useNotification()` and
 * this provider renders them through `<Notification />`. */
export function NotificationProvider({ children }: NotificationProviderProps) {
  const [notifications, setNotifications] = useState<NotificationMessage[]>(
    [],
  )

  const dismissNotification = useCallback((id: string) => {
    setNotifications((current) =>
      current.filter((notification) => notification.id !== id),
    )
  }, [])

  const showNotification = useCallback((message: NewNotification) => {
    const newNotification: NotificationMessage = { ...message, id: generateId() }
    setNotifications((current) => [...current, newNotification])
  }, [])

  const contextValue = useMemo(
    () => ({ showNotification, dismissNotification }),
    [showNotification, dismissNotification],
  )

  return (
    <NotificationContext.Provider value={contextValue}>
      {children}
      <Notification
        notifications={notifications}
        onDismiss={dismissNotification}
      />
    </NotificationContext.Provider>
  )
}
