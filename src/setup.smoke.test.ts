import { describe, expect, it } from 'vitest'
import fc from 'fast-check'

// Smoke test: confirms Vitest and fast-check work correctly end-to-end
// before writing the design's real properties.
describe('testing configuration', () => {
  it('runs unit tests with Vitest', () => {
    expect(1 + 1).toBe(2)
  })

  // Note: this is just a tooling smoke test, not a numbered design
  // property. Real properties follow the convention:
  // // Feature: asistente-ia-local, Property N: <property text>
  it('runs property-based tests with fast-check', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (a, b) => a + b === b + a),
      { numRuns: 100 },
    )
  })
})
