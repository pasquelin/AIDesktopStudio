import { describe, expect, it } from 'vitest'
import { standingAngles } from './scatterRotation'

/** `Euler` order XYZ is the matrix Rx·Ry·Rz, written out rather than taken from three. */
function upOf(angles: { x: number; y: number; z: number }): [number, number, number] {
  const rotated = (
    axis: 'x' | 'y' | 'z',
    angle: number,
    [px, py, pz]: [number, number, number],
  ): [number, number, number] => {
    const c = Math.cos(angle)
    const s = Math.sin(angle)
    if (axis === 'x') return [px, py * c - pz * s, py * s + pz * c]
    if (axis === 'y') return [px * c + pz * s, py, -px * s + pz * c]
    return [px * c - py * s, px * s + py * c, pz]
  }
  return rotated('x', angles.x, rotated('y', angles.y, rotated('z', angles.z, [0, 1, 0])))
}

describe('the angles a prop stands at', () => {
  const leaning: [string, number, number, number][] = [
    ['west', -0.7071, 0.7071, 0],
    ['north', 0, 0.7071, 0.7071],
    ['east and south', 0.5, 0.7071, -0.5],
    ['straight up', 0, 1, 0],
  ]

  it.each(leaning)('stands its local up on a normal leaning %s', (_where, nx, ny, nz) => {
    const up = upOf(standingAngles({ x: nx, y: ny, z: nz }, 0.7))

    // Read in the XYZ order `applyTransform` uses: a triple built for YXZ put the prop 90° off.
    expect(up[0]).toBeCloseTo(nx, 3)
    expect(up[1]).toBeCloseTo(ny, 3)
    expect(up[2]).toBeCloseTo(nz, 3)
  })

  it('spins around that normal without leaving it', () => {
    const normal = { x: -0.7071, y: 0.7071, z: 0 }

    const turned = [0, 1, 2, 3].map(quarter => upOf(standingAngles(normal, quarter)))

    for (const up of turned) {
      expect(up[0]).toBeCloseTo(normal.x, 3)
      expect(up[2]).toBeCloseTo(normal.z, 3)
    }
  })

  it('leans half-way when the alignment is half-way', () => {
    const rise = Math.tan(Math.PI / 4)
    const length = Math.hypot(rise, 1)
    // What `rotationOf` composes at `slopeAlign` 50 over a 45° slope.
    const half = { x: (-rise / length) * 0.5, y: 0.5 + (1 / length) * 0.5, z: 0 }

    const up = upOf(standingAngles(half, 0))
    const leaned = (Math.acos(up[1]) * 180) / Math.PI

    // 22.5°, and the closed form that normalised only one `atan2` term answered 20.97°.
    expect(leaned).toBeCloseTo(22.5, 1)
  })
})
