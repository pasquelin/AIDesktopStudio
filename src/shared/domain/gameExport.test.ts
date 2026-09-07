import { describe, expect, it } from 'vitest'
import { hasVisualChanges, NO_LOSSY_OPTIMIZATION } from './gameExport'

describe('export visual fidelity', () => {
  it('reports no visual change for absent and all-off LOSSY options', () => {
    expect(hasVisualChanges(undefined)).toBe(false)
    expect(hasVisualChanges(NO_LOSSY_OPTIMIZATION)).toBe(false)
  })

  it('reports a possible visual change for every LOSSY family', () => {
    expect(hasVisualChanges({ ...NO_LOSSY_OPTIMIZATION, generateLods: true })).toBe(true)
    expect(
      hasVisualChanges({ ...NO_LOSSY_OPTIMIZATION, geometrySimplification: 'conservative' }),
    ).toBe(true)
    expect(hasVisualChanges({ ...NO_LOSSY_OPTIMIZATION, textureCompression: 'balanced' })).toBe(
      true,
    )
    expect(hasVisualChanges({ ...NO_LOSSY_OPTIMIZATION, textureReduction: 'quarter' })).toBe(true)
  })
})
