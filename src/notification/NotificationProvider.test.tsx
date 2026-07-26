import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { NotificationProvider } from './NotificationProvider.tsx'
import { useNotification } from './useNotification.ts'
import type { NewNotification } from './model.ts'

/** Test helper component: exposes one button per sample notification
 * passed to it, to be able to trigger `showNotification()`
 * from a test without depending on any real producer component. */
function Trigger({ messages }: { messages: NewNotification[] }) {
  const { showNotification } = useNotification()
  return (
    <>
      {messages.map((message, index) => (
        <button
          key={index}
          type="button"
          onClick={() => {
            showNotification(message)
          }}
        >
          trigger-{index}
        </button>
      ))}
    </>
  )
}

describe('Notification (centralized mechanism)', () => {
  it('renders a notification published via showNotification()', async () => {
    const user = userEvent.setup()
    render(
      <NotificationProvider>
        <Trigger messages={[{ type: 'error', text: 'Fallo al guardar' }]} />
      </NotificationProvider>,
    )

    expect(screen.queryByText('Fallo al guardar')).not.toBeInTheDocument()

    await user.click(screen.getByText('trigger-0'))

    expect(screen.getByText('Fallo al guardar')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('dismisses a notification when clicking the close button', async () => {
    const user = userEvent.setup()
    render(
      <NotificationProvider>
        <Trigger messages={[{ type: 'info', text: 'Actualización disponible' }]} />
      </NotificationProvider>,
    )

    await user.click(screen.getByText('trigger-0'))
    expect(screen.getByText('Actualización disponible')).toBeInTheDocument()

    await user.click(screen.getByLabelText('Descartar notificación'))

    expect(
      screen.queryByText('Actualización disponible'),
    ).not.toBeInTheDocument()
  })

  it('renders the action button and runs its callback when clicked', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    render(
      <NotificationProvider>
        <Trigger
          messages={[
            {
              type: 'error',
              text: 'Descarga interrumpida',
              action: { label: 'Reintentar', onClick: onRetry },
            },
          ]}
        />
      </NotificationProvider>,
    )

    await user.click(screen.getByText('trigger-0'))
    await user.click(screen.getByText('Reintentar'))

    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('renders multiple simultaneous notifications independently', async () => {
    const user = userEvent.setup()
    render(
      <NotificationProvider>
        <Trigger
          messages={[
            { type: 'error', text: 'Error de importación' },
            { type: 'warning', text: 'Modo degradado activo' },
          ]}
        />
      </NotificationProvider>,
    )

    await user.click(screen.getByText('trigger-0'))
    await user.click(screen.getByText('trigger-1'))

    expect(screen.getByText('Error de importación')).toBeInTheDocument()
    expect(screen.getByText('Modo degradado activo')).toBeInTheDocument()

    // Dismissing one does not affect the other.
    const [firstCloseButton] = screen.getAllByLabelText('Descartar notificación')
    if (!firstCloseButton) {
      throw new Error('Expected at least one close button')
    }
    await user.click(firstCloseButton)

    expect(screen.queryByText('Error de importación')).not.toBeInTheDocument()
    expect(screen.getByText('Modo degradado activo')).toBeInTheDocument()
  })

  it('throws a descriptive error if useNotification() is used outside the provider', () => {
    function ComponentWithoutProvider() {
      useNotification()
      return null
    }

    expect(() => render(<ComponentWithoutProvider />)).toThrow(
      /useNotification\(\) must be used within a <NotificationProvider>/,
    )
  })
})
