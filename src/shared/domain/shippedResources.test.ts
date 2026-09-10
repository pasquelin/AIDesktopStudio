import { describe, expect, it } from 'vitest'
import { isShippedRoute, SHIPPED_FAMILIES } from './shippedResources'

describe('what the studio ships', () => {
  it('names each family once', () => {
    expect(new Set(SHIPPED_FAMILIES).size).toBe(SHIPPED_FAMILIES.length)
  })

  it('reads its own fragment and no neighbour’s', () => {
    expect(isShippedRoute('#shipped')).toBe(true)
    expect(isShippedRoute('#shipped/extra')).toBe(false)
    expect(isShippedRoute('#copies')).toBe(false)
  })
})
