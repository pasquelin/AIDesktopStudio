// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import { aeroForces, liftCoefficient, type Aero, type Airframe, type Stick } from './aerodynamics'
import { restingAxes } from './quaternion'

const FRAME: Airframe = { maxThrust: 12_000, wingArea: 16, stallAngle: 15, agility: 1, drag: 0.04 }
const IDLE: Stick = { throttle: 0, pitch: 0, roll: 0, yaw: 0 }
const STILL = { x: 0, y: 0, z: 0 }
const DEGREES = Math.PI / 180

const fresh = (): Aero => ({ force: { x: 0, y: 0, z: 0 }, torque: { x: 0, y: 0, z: 0 } })

/** Level flight along −Z at that many metres a second, the stick as given. */
const flying = (speed: number, stick: Partial<Stick> = {}, angular = STILL): Aero =>
  aeroForces(
    FRAME,
    { ...IDLE, ...stick },
    restingAxes(),
    { x: 0, y: 0, z: -speed },
    angular,
    fresh(),
  )

describe('aeroForces', () => {
  it('pushes along the nose at full throttle, and nothing else while standing still', () => {
    const aero = aeroForces(FRAME, { ...IDLE, throttle: 1 }, restingAxes(), STILL, STILL, fresh())
    expect([aero.force.x, aero.force.y, aero.force.z]).toEqual([0, 0, -12_000])
    expect([aero.torque.x, aero.torque.y, aero.torque.z]).toEqual([0, 0, 0])
  })

  it('answers no stick without air over the surfaces', () => {
    const aero = aeroForces(
      FRAME,
      { ...IDLE, pitch: 1, roll: 1 },
      restingAxes(),
      STILL,
      STILL,
      fresh(),
    )
    expect([aero.torque.x, aero.torque.y, aero.torque.z]).toEqual([0, 0, 0])
  })

  it('lifts a wing flying level, four times as much at twice the speed', () => {
    const slow = flying(20).force.y
    const fast = flying(40).force.y
    expect(slow).toBeGreaterThan(0)
    expect(fast / slow).toBeCloseTo(4)
  })

  it('drags against the airflow, and harder the more it lifts', () => {
    const level = flying(40)
    expect(level.force.z).toBeGreaterThan(0)

    // Nose up: more lift, and the drag it costs comes with it.
    const nosed = aeroForces(
      FRAME,
      IDLE,
      {
        forward: { x: 0, y: 0.17, z: -0.98 },
        right: { x: 1, y: 0, z: 0 },
        up: { x: 0, y: 0.98, z: 0.17 },
      },
      { x: 0, y: 0, z: -40 },
      STILL,
      fresh(),
    )
    expect(nosed.force.y).toBeGreaterThan(level.force.y)
    expect(nosed.force.z).toBeGreaterThan(level.force.z)
  })

  it('lets go of the wing past the stall angle', () => {
    const stall = 15 * DEGREES
    expect(liftCoefficient(stall, stall)).toBeGreaterThan(liftCoefficient(0, stall))
    expect(liftCoefficient(stall * 1.5, stall)).toBeLessThan(liftCoefficient(stall, stall))
    expect(liftCoefficient(stall * 2, stall)).toBeCloseTo(0)
    expect(liftCoefficient(-stall * 2, stall)).toBeCloseTo(0)
  })

  it('pitches the nose up on a pull, rolls right on a right stick, yaws right on a right pedal', () => {
    expect(flying(40, { pitch: 1 }).torque.x).toBeGreaterThan(0)
    // Rolling right is a turn about the nose, which points down −Z.
    expect(flying(40, { roll: 1 }).torque.z).toBeLessThan(0)
    // Yawing right is a turn about −Y: about +Y the nose would swing to −X, the left.
    expect(flying(40, { yaw: 1 }).torque.y).toBeLessThan(0)
  })

  it('resists a spin, so a plane let go of settles rather than tumbling', () => {
    expect(flying(40, {}, { x: 1, y: 0, z: 0 }).torque.x).toBeLessThan(0)
  })

  /**
   * 🛑 A damping torque that grows with v² outruns what a fixed step can absorb: it removes more
   * than the whole rotation in one step, so the spin flips sign and doubles, until Jolt clamps it
   * at 47,12 rad/s — measured, and the aeroplane then strobes and answers no stick at all.
   * Real damping grows with v, not v²: it is `ω·b/2v` that sets the local incidence.
   */
  it('damps a roll no harder than a step can absorb, however fast the air', () => {
    // A light airframe's roll inertia: 900 kg on a two-metre span is about 150 kg·m².
    const inertia = 150
    const step = 1 / 60
    const rolling = { x: 0, y: 0, z: -1 }

    const shrink = [40, 60, 90, 140].map(speed => {
      const torque = flying(speed, {}, rolling).torque
      // What the step does to the spin: past −2 it flips and grows, which is the divergence.
      return (Math.abs(torque.z) / inertia) * step
    })

    expect(Math.max(...shrink)).toBeLessThan(2)
  })
})
