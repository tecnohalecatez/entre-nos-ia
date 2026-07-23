import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

// Shared Testing Library configuration for React component tests (see
// src/testing-conventions.md). `globals: false` in vitest.config.ts means
// `afterEach` must be imported explicitly here to unmount the DOM between
// tests and avoid leaks across cases.
afterEach(() => {
  cleanup()
})
