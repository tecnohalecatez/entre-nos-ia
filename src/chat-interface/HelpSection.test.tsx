import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HelpSection } from './HelpSection.tsx'

describe('HelpSection', () => {
  it('shows the privacy declaration required by Requirement 6.3', () => {
    render(<HelpSection />)

    expect(
      screen.getByText(
        /ninguna de tus conversaciones ni mensajes se transmite a servidores externos/i,
      ),
    ).toBeInTheDocument()
  })

  it('declares the set of Navegador_Compatible capabilities from Requirement 10.4', () => {
    render(<HelpSection />)

    expect(screen.getByText(/webgpu/i)).toBeInTheDocument()
    expect(screen.getByText(/webassembly/i)).toBeInTheDocument()
    expect(screen.getByText(/service worker/i)).toBeInTheDocument()
    expect(screen.getByText(/cache api/i)).toBeInTheDocument()
    expect(screen.getByText(/indexeddb/i)).toBeInTheDocument()
  })

  it('does not require a specific browser or operating system', () => {
    render(<HelpSection />)

    expect(
      screen.getByText(/sin requerir un navegador o sistema operativo específico/i),
    ).toBeInTheDocument()
  })
})
