// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { BodyDescriptor, PhysicsPort, VehicleSettings } from '../ports/physicsPort'
import { describedBody as body, restingAt as at } from '../physics/physics-fixtures'
import { joltFreeBytes, loadJoltPhysics } from './joltPhysics'
import { FLOOR, STEP, poseOf } from './joltPhysics-fixtures'

const CAR: VehicleSettings = {
  wheelRadius: 0.35,
  wheelWidth: 0.25,
  suspensionLength: 0.4,
  maxSteerAngle: 30,
  maxTorque: 500,
  wheels: [
    {
      body: 'fl',
      at: { x: -0.9, y: -0.1, z: -1.4 },
      steers: true,
      driven: true,
      handBraked: false,
    },
    {
      body: 'fr',
      at: { x: 0.9, y: -0.45, z: -1.4 },
      steers: true,
      driven: true,
      handBraked: false,
    },
    {
      body: 'bl',
      at: { x: -0.9, y: -0.45, z: 1.4 },
      steers: false,
      driven: true,
      handBraked: true,
    },
    { body: 'br', at: { x: 0.9, y: -0.45, z: 1.4 }, steers: false, driven: true, handBraked: true },
  ],
}

const car = (over: Partial<BodyDescriptor> = {}): BodyDescriptor =>
  body({
    body: 'car',
    shape: { kind: 'cuboid', hx: 0.9, hy: 0.25, hz: 2 },
    transform: at(0, 0.8, 0),
    mass: 1500,
    vehicle: CAR,
    ...over,
  })

describe('what rolls on wheels and what is pushed', () => {
  let port: PhysicsPort

  beforeEach(async () => {
    port = await loadJoltPhysics()
    port.setGravity(-9.81)
    port.add([body({ body: 'floor', kind: 'fixed', shape: FLOOR, transform: at(0, -0.5, 0) })])
  })

  afterEach(() => {
    port.dispose()
  })

  /** Where the car last stood: a car left alone falls asleep, and a sleeper reports no pose. */
  const driven = (forward: number, steer: number, steps: number, handBrake = 0) => {
    let last = { x: 0, y: 0, z: 0 }
    for (let step = 0; step < steps; step++) {
      port.drive([{ body: 'car', forward, steer, brake: 0, handBrake }])
      port.step(STEP)
      const pose = poseOf(port, 'car')
      if (pose) last = { ...pose.position }
    }
    return last
  }

  it('drives a car forward on its suspension when the pedal is down', () => {
    expect(port.add([car()])).toEqual([])
    const settled = driven(0, 0, 60)
    const gone = driven(1, 0, 120)

    // Forward is −Z; the body hangs on its springs rather than resting on the floor.
    expect(gone.z).toBeLessThan(settled.z - 2)
    expect(gone.y).toBeGreaterThan(0.6)
    expect(Math.abs(gone.x)).toBeLessThan(0.2)
  })

  /**
   * 🛑 The axles were opened from a wheel at `x < 0` alone, so a chassis whose pivot sits on the
   * left wheel line paired nothing: `mDifferentials` stayed empty, `rideOf` still answered a
   * `Ride`, and the engine drove no wheel at all — a car that answers the pedal by standing still.
   */
  it('drives a car whose pivot sits off the middle of its own axles', () => {
    const shifted: VehicleSettings = {
      ...CAR,
      wheels: CAR.wheels.map(wheel => ({ ...wheel, at: { ...wheel.at, x: wheel.at.x + 0.9 } })),
    }
    expect(port.add([car({ vehicle: shifted })])).toEqual([])

    const settled = driven(0, 0, 60)
    const gone = driven(1, 0, 120)

    expect(gone.z).toBeLessThan(settled.z - 2)
  })

  it('turns to the right on a right input, which is +X when heading −Z', () => {
    port.add([car()])
    driven(0, 0, 60)
    const turned = driven(1, 1, 180)

    expect(turned.x).toBeGreaterThan(0.5)
  })

  it('reports each wheel where it stands under the body, every step', () => {
    port.add([car()])
    driven(1, 0, 60)
    const wheels = new Map(port.poses().map(pose => [pose.body, pose.position]))
    const body = wheels.get('car')!

    for (const name of ['fl', 'fr', 'bl', 'br']) {
      const wheel = wheels.get(name)!
      expect(wheel.y).toBeLessThan(body.y)
      expect(wheel.y).toBeGreaterThan(0.1)
      expect(Math.abs(wheel.x - body.x)).toBeCloseTo(0.9, 1)
    }
  })

  it('holds a car still on its hand brake', () => {
    port.add([car()])
    const before = driven(0, 0, 60)
    const held = driven(1, 0, 120, 1)

    expect(Math.abs(held.z - before.z)).toBeLessThan(0.5)
  })

  it('refuses wheels on a body the simulation does not move', () => {
    expect(port.add([car({ kind: 'kinematic' })])).toEqual(['car'])
    expect(port.add([car({ kind: 'fixed' })])).toEqual(['car'])
  })

  it('lifts a body against gravity with a force, and says how it then moves', () => {
    port.add([
      body({
        body: 'crate',
        shape: { kind: 'cuboid', hx: 0.3, hy: 0.3, hz: 0.3 },
        transform: at(0, 2, 0),
        mass: 1,
      }),
    ])
    for (let step = 0; step < 60; step++) {
      port.push([{ body: 'crate', force: { x: 0, y: 30, z: 0 }, torque: { x: 0, y: 0, z: 0 } }])
      port.step(STEP)
    }

    const [motion] = port.motion(['crate', 'nobody'])
    expect(port.motion(['crate', 'nobody'])).toHaveLength(1)
    // Thirty newtons on a kilo against 9,81: it climbs at about twenty metres a second.
    expect(motion!.linear.y).toBeGreaterThan(15)
    expect(poseOf(port, 'crate')!.position.y).toBeGreaterThan(5)
  })

  it('spins a body with a torque', () => {
    port.add([
      body({
        body: 'top',
        shape: { kind: 'cuboid', hx: 0.3, hy: 0.3, hz: 0.3 },
        transform: at(0, 5, 0),
        mass: 1,
        gravityScale: 0,
      }),
    ])
    for (let step = 0; step < 30; step++) {
      port.push([{ body: 'top', force: { x: 0, y: 0, z: 0 }, torque: { x: 0, y: 2, z: 0 } }])
      port.step(STEP)
    }

    expect(port.motion(['top'])[0]!.angular.y).toBeGreaterThan(1)
  })

  it('gives back every byte a vehicle took, cycle after cycle', async () => {
    const marks: number[] = []
    for (let cycle = 0; cycle < 5; cycle++) {
      port.add([car()])
      driven(1, 0.5, 100)
      port.motion(['car'])
      port.remove(['car'])
      marks.push(await joltFreeBytes())
    }

    // Eight bytes of allocator alignment come and go between cycles, measured, and never add
    // up. A leak did: before the by-value copies were freed, each cycle cost 104 and kept costing.
    expect(Math.max(...marks) - Math.min(...marks)).toBeLessThanOrEqual(8)
  })
})
