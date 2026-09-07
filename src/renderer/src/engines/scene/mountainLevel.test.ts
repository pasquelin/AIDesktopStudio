// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import { DEFAULT_CAMERA } from '@shared/domain/scene'
import { MOUNTAIN_WORLD, mountainNodes } from './mountainLevel'
import type { SceneNode } from './sceneState'

describe('the relief an aircraft flies through', () => {
  const peaks = mountainNodes().filter(node => node.name.startsWith('Peak'))

  // 🛑 The airfield beside them is DECOR: a massif left decor too is flown straight through.
  it('makes every peak something a plane can hit', () => {
    const felt = peaks.filter(node => (node.components ?? []).some(one => one.type === 'RigidBody'))

    expect(felt).toHaveLength(peaks.length)
    expect(peaks.length).toBeGreaterThan(8)
  })

  // Measured against the RUNWAY, a 600 m ribbon: a distance to the origin says nothing about a
  // peak beside its far end.
  it('leaves the runway clear by more than a mountain is wide', () => {
    const clear = peaks.map(node => {
      const shape = node.type === 'mesh' ? node.geometry : null
      const base = shape?.kind === 'cylinder' ? shape.radiusBottom : 0
      // Point to RECTANGLE: the strip is 30 m across and 600 m long, centred on the origin.
      const across = Math.max(0, Math.abs(node.transform.position.x) - 15)
      const along = Math.max(0, Math.abs(node.transform.position.z) - 300)
      return Math.hypot(across, along) - base
    })

    expect(Math.min(...clear)).toBeGreaterThan(0)
  })

  // 🛑 `MOUNTAIN_WORLD` is a FULL width, so the world reaches half of it each way. Three peaks
  // stood entirely past its edge, rising out of nothing.
  it('stands every peak on the ground the scene owns', () => {
    const half = MOUNTAIN_WORLD / 2
    const outside = peaks.filter(node => {
      const shape = node.type === 'mesh' ? node.geometry : null
      const base = shape?.kind === 'cylinder' ? shape.radiusBottom : 0
      return (
        Math.abs(node.transform.position.x) + base > half ||
        Math.abs(node.transform.position.z) + base > half
      )
    })

    expect(outside.map(node => node.name)).toEqual([])
  })

  // 🛑 A drawn decagon is felt as the CONE AROUND it: at a 420 m radius the collision stood 20 m
  // outside the rock. `r·(1 − cos(π/segments))` is that gap.
  it('keeps the felt rock within a wingspan of the drawn one', () => {
    const worst = Math.max(
      ...peaks.map(node => {
        const shape = node.type === 'mesh' ? node.geometry : null
        if (shape?.kind !== 'cylinder') return 0
        return shape.radiusBottom * (1 - Math.cos(Math.PI / shape.segments))
      }),
    )

    // A wing is twelve metres across; a gap wider than that is a wall nobody can see.
    expect(worst).toBeLessThan(12)
  })

  // 🛑 The peaks stood at 1620 to 1780 m against a `far` of a thousand: clipped away whole, and
  // the map's emptiness was then blamed on its textures.
  it('lays nothing beyond the far plane a camera opens with', () => {
    // The far CORNER, never the centre plus a radius: a strip 1400 m long centred on the origin
    // has its centre in plain sight and both its ends past the plane.
    const halfOf = (node: SceneNode): { x: number; z: number } => {
      if (node.type !== 'mesh') return { x: 0, z: 0 }
      const shape = node.geometry
      if (shape.kind === 'cylinder') return { x: shape.radiusBottom, z: shape.radiusBottom }
      if (shape.kind === 'box') return { x: shape.width / 2, z: shape.depth / 2 }
      // Laid flat, so its own height is read down Z.
      if (shape.kind === 'plane') return { x: shape.width / 2, z: shape.height / 2 }
      return { x: 0, z: 0 }
    }

    const past = mountainNodes().filter(node => {
      const at = node.transform.position
      const half = halfOf(node)
      return Math.hypot(Math.abs(at.x) + half.x, Math.abs(at.z) + half.z) > DEFAULT_CAMERA.far
    })

    expect(past.map(node => node.name)).toEqual([])
  })

  // 🛑 A full-width strip laid 5 cm over the ground buried 535 of the runway's 600 m, and the
  // airfield vanished from the air.
  it('lays no ground over the runway', () => {
    const over = mountainNodes().filter(node => {
      if (node.type !== 'mesh' || node.geometry.kind !== 'plane') return false
      const halfX = node.geometry.width / 2
      const halfZ = node.geometry.height / 2
      // The strip is 30 m across and 600 m long, centred on the origin.
      return (
        Math.abs(node.transform.position.x) - halfX < 15 &&
        Math.abs(node.transform.position.z) - halfZ < 300
      )
    })

    expect(over.map(node => node.name)).toEqual([])
  })
})
