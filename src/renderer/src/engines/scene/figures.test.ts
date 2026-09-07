import { describe, expect, it } from 'vitest'
import { FIGURE_ENTRIES } from '@shared/domain/scene'
import { figureByKind, FIGURE_TYPES, type FigureDescriptor } from './figures'

/** The box the whole figure fills, in its own frame — what an eye reads as its silhouette. */
function spans(figure: FigureDescriptor): {
  height: number
  width: number
  depth: number
  bottom: number
} {
  const bounds = { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 }
  for (const { at, size } of figure.parts) {
    bounds.minX = Math.min(bounds.minX, at.x - size.x / 2)
    bounds.maxX = Math.max(bounds.maxX, at.x + size.x / 2)
    bounds.minY = Math.min(bounds.minY, at.y - size.y / 2)
    bounds.maxY = Math.max(bounds.maxY, at.y + size.y / 2)
    bounds.minZ = Math.min(bounds.minZ, at.z - size.z / 2)
    bounds.maxZ = Math.max(bounds.maxZ, at.z + size.z / 2)
  }
  return {
    height: bounds.maxY - bounds.minY,
    width: bounds.maxX - bounds.minX,
    depth: bounds.maxZ - bounds.minZ,
    bottom: bounds.minY,
  }
}

describe('the figures a scene can be given', () => {
  it('offers exactly what the shared table declares, in its order', () => {
    expect(FIGURE_TYPES.map(figure => figure.kind)).toEqual(FIGURE_ENTRIES.map(entry => entry.kind))
  })

  it('answers nothing for a kind no registry holds', () => {
    expect(figureByKind('centaur')).toBeNull()
  })

  /** 🛑 Every one of them, not the humanoid alone: a figure that lies about the height it fills
   * is scaled wrong by whoever fits it into a body, and reads as a doll. */
  it('fills exactly the height each one announces, centred on its middle', () => {
    for (const figure of FIGURE_TYPES) {
      const { height, bottom } = spans(figure.create())

      expect(height).toBeCloseTo(figure.create().height, 2)
      expect(bottom).toBeCloseTo(-figure.create().height / 2, 2)
    }
  })

  describe('the humanoid', () => {
    const built = (): FigureDescriptor =>
      figureByKind('humanoid')?.create() ?? { kind: 'humanoid', height: 0, parts: [] }

    /** The controller's own radius is 0,3 — a shoulder wider than that pokes out of the cage. */
    it('keeps its shoulders and its feet inside the body', () => {
      const { width, depth } = spans(built())

      expect(width).toBeLessThanOrEqual(0.6)
      expect(depth).toBeLessThanOrEqual(0.6)
    })

    /** What the whole family exists for: a node wears ONE material, so clothes are several. */
    it('is painted in more than one colour, which is what the clothes are', () => {
      expect(new Set(built().parts.map(part => part.colour)).size).toBeGreaterThan(3)
    })

    it('names every part, so an outliner of a dozen rows can be read', () => {
      const named = built().parts.map(part => part.name)

      expect(new Set(named).size).toBe(named.length)
      expect(named).toContain('Head')
    })
  })
})
