import { describe, expect, it } from 'vitest'
import { RingGeometry } from 'three'
import { createReliefBrushCursor, ringOf } from './reliefBrushCursor'

describe('relief brush cursor', () => {
  it('is a thin ring when falloff is 0, and a disk when falloff is 1', () => {
    const hard = ringOf(2, 0)
    expect(hard).toBeInstanceOf(RingGeometry)
    expect(hard.parameters.outerRadius).toBe(2)
    expect(hard.parameters.innerRadius).toBeGreaterThan(1.8)
    expect(hard.parameters.innerRadius).toBeLessThan(2)

    const soft = ringOf(2, 1)
    expect(soft.parameters.outerRadius).toBe(2)
    expect(soft.parameters.innerRadius).toBe(0)
  })

  it('lies on XZ and does not catch the sculpt ray', () => {
    const cursor = createReliefBrushCursor()
    expect(cursor.object.rotation.x).toBeCloseTo(-Math.PI / 2)
    expect(cursor.object.visible).toBe(false)

    cursor.set({ x: 1, y: 2, z: 3, radius: 4, falloff: 0.5, visible: true, color: '#fff' })
    expect(cursor.object.visible).toBe(true)
    expect(cursor.object.position.toArray()).toEqual([1, 2, 3])
    const geometry = cursor.object.geometry
    expect(geometry).toBeInstanceOf(RingGeometry)
    if (geometry instanceof RingGeometry) {
      expect(geometry.parameters.outerRadius).toBe(4)
      expect(geometry.parameters.innerRadius).toBe(2)
    }

    cursor.dispose()
  })
})
