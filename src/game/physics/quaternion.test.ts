// SPDX-License-Identifier: MIT

import { Euler, Quaternion as ThreeQuaternion } from 'three'
import { describe, expect, it } from 'vitest'
import {
  axesOf,
  eulerFromQuaternion,
  quaternionFromEuler,
  restingAxes,
  type Axes,
} from './quaternion'

const ANGLES = [
  { x: 0, y: 0, z: 0 },
  { x: 0.3, y: -1.2, z: 2.4 },
  { x: -2.9, y: 0.7, z: 0.1 },
  { x: 1, y: Math.PI / 2 - 1e-8, z: 0 },
]

describe('the angles of a document, read as three.js wrote them', () => {
  /**
   * 🛑 Against three.js and not against a round trip: an order of its own would round-trip
   * perfectly and turn every scene the studio has ever saved.
   */
  it('spells a rotation the way three.js does', () => {
    for (const angles of ANGLES) {
      const wanted = new ThreeQuaternion().setFromEuler(
        new Euler(angles.x, angles.y, angles.z, 'XYZ'),
      )
      const held = quaternionFromEuler(angles)

      expect(held.x).toBeCloseTo(wanted.x, 12)
      expect(held.y).toBeCloseTo(wanted.y, 12)
      expect(held.z).toBeCloseTo(wanted.z, 12)
      expect(held.w).toBeCloseTo(wanted.w, 12)
    }
  })

  it('reads one back the way three.js reads it', () => {
    for (const angles of ANGLES) {
      const rotation = quaternionFromEuler(angles)
      const wanted = new Euler().setFromQuaternion(
        new ThreeQuaternion(rotation.x, rotation.y, rotation.z, rotation.w),
        'XYZ',
      )
      const held = eulerFromQuaternion(rotation, { x: 0, y: 0, z: 0 })

      expect(held.x).toBeCloseTo(wanted.x, 10)
      expect(held.y).toBeCloseTo(wanted.y, 10)
      expect(held.z).toBeCloseTo(wanted.z, 10)
    }
  })

  /** Written INTO what it is given: a step reads a pose per body per frame. */
  it('writes into the vector it is handed rather than making one', () => {
    const into = { x: 9, y: 9, z: 9 }

    expect(eulerFromQuaternion({ x: 0, y: 0, z: 0, w: 1 }, into)).toBe(into)
    expect(into.x).toBeCloseTo(0, 12)
    expect(into.y).toBeCloseTo(0, 12)
    expect(into.z).toBeCloseTo(0, 12)
  })
})

describe('axesOf', () => {
  const axes = (angles: { x: number; y: number; z: number }) =>
    axesOf(quaternionFromEuler(angles), restingAxes())

  // Close rather than equal: the extraction writes a signed zero where the basis has a plain one,
  // and `toEqual` reads −0 and 0 as different values where every other reader reads them as equal.
  it('answers the resting basis for no turn, forward being −Z', () => {
    const read = axes({ x: 0, y: 0, z: 0 })
    const resting = restingAxes()
    for (const name of ['forward', 'right', 'up'] satisfies (keyof Axes)[]) {
      expect(read[name].x).toBeCloseTo(resting[name].x)
      expect(read[name].y).toBeCloseTo(resting[name].y)
      expect(read[name].z).toBeCloseTo(resting[name].z)
    }
  })

  it('turns the forward to −X on a quarter yaw to the left', () => {
    const { forward, right, up } = axes({ x: 0, y: Math.PI / 2, z: 0 })
    expect(forward.x).toBeCloseTo(-1)
    expect(forward.z).toBeCloseTo(0)
    expect(right.z).toBeCloseTo(-1)
    expect(up.y).toBeCloseTo(1)
  })

  it('lifts the nose on a positive pitch, keeping the right axis level', () => {
    const { forward, right } = axes({ x: Math.PI / 6, y: 0, z: 0 })
    expect(forward.y).toBeCloseTo(0.5)
    expect(right.x).toBeCloseTo(1)
    expect(right.y).toBeCloseTo(0)
    expect(right.z).toBeCloseTo(0)
  })
})
