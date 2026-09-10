import { describe, expect, it } from 'vitest'
import { isShippedRoute, SHIPPED_FAMILIES, SHIPPED_PLACEMENT } from './shippedResources'

describe('what the studio ships', () => {
  it('decides for every family whether placing it means anything', () => {
    expect(SHIPPED_FAMILIES.filter(family => SHIPPED_PLACEMENT[family] === undefined)).toEqual([])
  })

  /**
   * 🛑 Measured, not cautious: a shipped clip is already offered wherever a clip is chosen and
   * the game export bundles it, so a copy in the project would be a second copy of the same
   * bytes buying nothing. The day something needs it filed, this line is what changes.
   */
  it('keeps the clips out of the project, and the two others in', () => {
    expect(SHIPPED_PLACEMENT.animations).toBe('reachable')
    expect(SHIPPED_PLACEMENT.character).toBe('install')
    expect(SHIPPED_PLACEMENT.textures).toBe('install')
  })

  it('reads its own fragment and no neighbour’s', () => {
    expect(isShippedRoute('#shipped')).toBe(true)
    expect(isShippedRoute('#shipped/extra')).toBe(false)
    expect(isShippedRoute('#copies')).toBe(false)
  })
})
