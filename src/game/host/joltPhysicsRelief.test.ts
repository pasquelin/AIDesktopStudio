// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { PhysicsPort } from '../ports/physicsPort'
import type { ColliderShape } from '../physics/shape'
import { describedBody as body } from '../physics/physics-fixtures'
import { loadJoltPhysics } from './joltPhysics'

/** The terrain, whose collider is the only thing standing between a scene and a falling player. */
describe('the relief as Jolt stands it up', () => {
  let port: PhysicsPort

  beforeEach(async () => {
    port = await loadJoltPhysics()
    port.setGravity(-9.81)
  })

  afterEach(() => {
    port.dispose()
  })

  it('hits a ramp higher where the samples are higher, along X not Z', () => {
    const heights = new Float32Array(16)
    for (let z = 0; z < 4; z++) for (let x = 0; x < 4; x++) heights[z * 4 + x] = x
    const ramp: ColliderShape = {
      kind: 'heightfield',
      heights,
      width: 4,
      height: 4,
      offset: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    }

    expect(port.add([body({ body: 'ground', kind: 'fixed', shape: ramp })])).toEqual([])

    const at = (x: number) =>
      port.cast({ x, y: 10, z: 1.5 }, { x, y: -10, z: 1.5 }, 0, []) ?? Number.NaN
    expect(at(0.5)).toBeCloseTo(0.475, 2)
    expect(at(2.5)).toBeCloseTo(0.375, 2)
  })

  it('stops a downward ray on a heightfield at the height the samples name', () => {
    const plateau: ColliderShape = {
      kind: 'heightfield',
      heights: new Float32Array(16).fill(2),
      width: 4,
      height: 4,
      offset: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    }

    expect(port.add([body({ body: 'ground', kind: 'fixed', shape: plateau })])).toEqual([])
    expect(port.cast({ x: 1.5, y: 10, z: 1.5 }, { x: 1.5, y: -10, z: 1.5 }, 0, [])).toBeCloseTo(
      0.4,
      2,
    )
  })

  // 1024x1024, the ordinary size of a relief: over a million samples, past the argument limit a
  // spread carries — where `Math.min(...samples)` threw inside `add` and left the terrain with no
  // collider at all, every dynamic body falling through it while the log filled with RangeError.
  it('gives a relief too wide to spread its samples a collider all the same', () => {
    const side = 1024
    const plain: ColliderShape = {
      kind: 'heightfield',
      heights: new Float32Array(side * side).fill(2),
      width: side,
      height: side,
      offset: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    }

    expect(port.add([body({ body: 'ground', kind: 'fixed', shape: plain })])).toEqual([])
    expect(port.cast({ x: 1.5, y: 10, z: 1.5 }, { x: 1.5, y: -10, z: 1.5 }, 0, [])).toBeCloseTo(
      0.4,
      2,
    )
  })

  it('refuses a heightfield that would have to move, and takes the same field standing still', () => {
    const field: ColliderShape = {
      kind: 'heightfield',
      heights: new Float32Array(16).fill(0),
      width: 4,
      height: 4,
      offset: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    }

    const refused = port.add([
      body({ body: 'ground', kind: 'fixed', shape: field }),
      body({ body: 'flying', kind: 'dynamic', shape: field }),
    ])

    expect(refused).toEqual(['flying'])
  })
})
