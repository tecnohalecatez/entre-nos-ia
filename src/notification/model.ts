// Data model for the centralized Notification component.
//
// Single presentation point for errors (and other messages) from all
// components: storage (5.2), download (2.6, 8.3, 8.4), generation
// (8.2), engine initialization (8.1, 8.5), import/export
// (7.2, 7.4) and Service Worker (3.3, 3.5).

/** Semantic type of a notification. Only "error" is essential for
 * the design's error handling; "info" and "warning" remain
 * available for cases that are not strictly errors (e.g. update
 * available notices, task 19.2). */
export type NotificationType = 'error' | 'info' | 'warning'

/** Optional action associated with a notification, e.g. "Retry" for
 * retry flows (2.6, 8.2, 8.3) or "Apply update"
 * (reusable in 9.x). */
export interface NotificationAction {
  label: string
  onClick: () => void
}

/** Notification as stored and rendered in the internal state of the
 * Notification component. */
export interface NotificationMessage {
  id: string
  type: NotificationType
  text: string
  action?: NotificationAction
}

/** Data that any application component provides to request that a new
 * notification be shown; the `id` is assigned internally by the
 * centralized mechanism. */
export type NewNotification = Omit<NotificationMessage, 'id'>
