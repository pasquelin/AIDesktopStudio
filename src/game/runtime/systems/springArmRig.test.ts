// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import type { Vector3 } from '@shared/domain/transform'
import { aheadOf } from '../playView'
import { armPivot, armSeat } from './springArmRig'

const at = (): Vector3 => ({ x: 0, y: 0, z: 0 })

describe('where a spring arm hangs its camera', () => {
  it('lifts the pivot off the subject by the height asked for', () => {
    expect(armPivot({ x: 1, y: 0, z: 2 }, 1.6, 0, 0, at())).toEqual({ x: 1, y: 1.6, z: 2 })
  })

  /** The shoulder pushes ACROSS the look, which is what turns a centred shot into an over-the-
   * shoulder one — so it swings round with the yaw rather than staying on the world's x. */
  it('swings the shoulder round with the look', () => {
    const turned = armPivot({ x: 0, y: 0, z: 0 }, 0, 1, Math.PI / 2, at())

    expect(turned.x).toBeCloseTo(0)
    expect(turned.z).toBeCloseTo(-1)
  })

  /** Behind, and behind means +z at rest: three points a camera down its own −z. */
  it('seats the camera behind the pivot, by the length', () => {
    const seat = armSeat({ x: 0, y: 1.6, z: 0 }, aheadOf({ yaw: 0, pitch: 0 }, at()), 4, at())

    expect(seat.x).toBeCloseTo(0)
    expect(seat.y).toBeCloseTo(1.6)
    expect(seat.z).toBeCloseTo(4)
  })

  it('lifts the seat when the look is pitched down, so the shot looks along it', () => {
    const seat = armSeat({ x: 0, y: 0, z: 0 }, aheadOf({ yaw: 0, pitch: -0.5 }, at()), 4, at())

    expect(seat.y).toBeCloseTo(4 * Math.sin(0.5))
  })
})
