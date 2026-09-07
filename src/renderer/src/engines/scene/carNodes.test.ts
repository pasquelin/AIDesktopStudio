// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import { carNodes } from './carNodes'

const origin = { x: 0, y: 0, z: 0 }

describe('the car a vehicle template opens on', () => {
  /**
   * 🛑 The nose is at −Z, `WHEELS` putting the front axle there. Turned to the heading straight,
   * the car faced back down its own straight and the start line stood behind it.
   */
  it('points its nose where the heading says it is going', () => {
    for (const heading of [0, Math.PI / 2, -2.4]) {
      const body = carNodes(origin, 'Car', heading)[0]!
      const yaw = body.transform.rotation.y
      // The nose in world terms: −Z of the body's own frame, turned by its yaw.
      const nose = { x: -Math.sin(yaw), z: -Math.cos(yaw) }

      expect(nose.x).toBeCloseTo(Math.sin(heading), 6)
      expect(nose.z).toBeCloseTo(Math.cos(heading), 6)
    }
  })

  /** Every wheel is named by the body, or the vehicle component drives nothing. */
  it('names its wheels after the car', () => {
    const nodes = carNodes(origin, 'Rally')

    expect(nodes.filter(node => node.name.startsWith('Rally Wheel'))).toHaveLength(4)
  })
})
