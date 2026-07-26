import type { NotificationMessage } from './model.ts'
import './Notification.css'

export interface NotificationProps {
  notifications: NotificationMessage[]
  onDismiss: (id: string) => void
}

/** Pure presentation component: renders the list of active
 * notifications as a fixed "toast" container. It is the only place in
 * the Chat_Interface where errors and other messages are presented, so
 * as not to duplicate presentation logic in each producer component. */
export function Notification({ notifications, onDismiss }: NotificationProps) {
  if (notifications.length === 0) {
    return null
  }

  return (
    <div
      className="notification-container"
      role="region"
      aria-label="Notificaciones"
    >
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className={`notification notification--${notification.type}`}
          role={notification.type === 'error' ? 'alert' : 'status'}
        >
          <p className="notification__text">{notification.text}</p>
          <div className="notification__actions">
            {notification.action ? (
              <button
                type="button"
                className="notification__action-button"
                onClick={notification.action.onClick}
              >
                {notification.action.label}
              </button>
            ) : null}
            <button
              type="button"
              className="notification__close-button"
              aria-label="Descartar notificación"
              onClick={() => {
                onDismiss(notification.id)
              }}
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
