// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import type { JsonValue } from '@shared/domain/component'
import { newComponent } from '@shared/domain/componentRegistry'
import { createIntents, type Intents } from '../intents'
import { notedPhysics, type NotedPhysics } from '../../physics/physics-fixtures'
import { restingTransform } from '../entity'
import { standardGamepad } from '../input-fixtures'
import { STEP_SECONDS } from '../gameLoop'
import { createPilots, type Pilots } from '../pilots'
import { testPorts, testWorld } from '../world-fixtures'
import type { World } from '../world'
import { createAircraftSystem } from './aircraft'

type Bench = { world: World; physics: NotedPhysics; pilots: Pilots; intents: Intents }

function bench(
  held: readonly string[] = [],
  over: Record<string, JsonValue> = {},
  pad?: Parameters<typeof standardGamepad>,
): Bench {
  const physics = notedPhysics()
  const pilots = createPilots()
  const intents = createIntents()
  const world = testWorld({
    ports: testPorts({ physics }),
    systems: [createAircraftSystem(pilots, intents)],
  })
  world.entities.add({
    id: 'plane',
    name: 'plane',
    transform: restingTransform(),
    components: [newComponent('RigidBody'), { ...newComponent('Aircraft'), ...over }],
  })
  // Level flight along its own nose, which is −Z: the airflow every surface is measured against.
  physics.answers.motion = [
    { body: 'plane', linear: { x: 0, y: 0, z: -80 }, angular: { x: 0, y: 0, z: 0 } },
  ]
  world.ports.input.state = () => ({
    held,
    pressed: [],
    released: [],
    pointer: { x: 0, y: 0, down: false },
    gamepads: pad ? [standardGamepad(...pad)] : [],
  })
  return { world, physics, pilots, intents }
}

const pushed = (bench: Bench, steps = 1) => {
  for (let step = 0; step < steps; step++) bench.world.step(STEP_SECONDS)
  // A whole FRAME, steps and all: the seat is claimed at the image, where the camera reads it.
  bench.world.lateUpdate(0, STEP_SECONDS)
  return bench.physics.pushed.at(-1) ?? null
}

describe('what flies', () => {
  it('pulls the nose up on a stick pulled back, as the down arrow already did', () => {
    const stick = pushed(bench([], {}, [{ leftY: 1 }]), 30)
    const arrow = pushed(bench(['ArrowDown']), 30)

    expect(stick?.torque.x).toBeCloseTo(arrow?.torque.x ?? 0)
    expect(stick?.torque.x).not.toBe(0)
  })

  it('flies on what a SCRIPT asks, the stick saying nothing that step', () => {
    const asked = bench()
    asked.intents.fly('plane', 1, 0, 0, 0)
    const stick = pushed(bench([], {}, [{ leftY: 1 }]), 1)

    expect(pushed(asked, 1)?.torque.x).toBeCloseTo(stick?.torque.x ?? 0)
  })

  it('opens the throttle on the right trigger, which is the lever Shift holds', () => {
    const trigger = pushed(bench([], {}, [{}, ['rightTrigger']]), 120)?.force.z ?? 0

    expect(trigger).toBeCloseTo(pushed(bench(['ShiftLeft']), 120)?.force.z ?? 0, 0)
  })

  it('pushes a lifting, thrusting force into the body every step', () => {
    const force = pushed(bench())?.force

    expect(force?.y).toBeGreaterThan(0)
    expect(force?.z).toBeLessThan(0)
  })

  /**
   * 🛑 The throttle is a LEVER held between steps, not a pedal: an engine that idles the moment a
   * finger lifts is not something anyone can fly.
   */
  it('opens the throttle while the lever is held, and holds it once let go', () => {
    const plane = bench(['ShiftLeft'])
    const opened = pushed(plane, 120)?.force.z ?? 0
    const cruising = pushed(bench(), 120)?.force.z ?? 0
    expect(opened).toBeLessThan(cruising)

    plane.world.ports.input.state = () => ({
      held: [],
      pressed: [],
      released: [],
      pointer: { x: 0, y: 0, down: false },
    })
    expect(pushed(plane, 60)?.force.z).toBeCloseTo(opened, 0)
  })

  it('closes the throttle on the other lever, and never past shut', () => {
    expect(pushed(bench(['ControlLeft']), 600)?.force.z).toBeCloseTo(
      pushed(bench(['ControlLeft']), 1200)?.force.z ?? 0,
      0,
    )
  })

  it('pitches, rolls and yaws on the stick, and each about its own axis', () => {
    expect(pushed(bench(['KeyS']))?.torque.x).toBeGreaterThan(0)
    expect(pushed(bench(['KeyD']))?.torque.z).toBeLessThan(0)
    expect(pushed(bench(['KeyE']))?.torque.y).toBeLessThan(0)
  })

  it('answers no stick while standing still on the ground', () => {
    const plane = bench(['KeyS'])
    plane.physics.answers.motion = [
      { body: 'plane', linear: { x: 0, y: 0, z: 0 }, angular: { x: 0, y: 0, z: 0 } },
    ]
    const torque = pushed(plane)?.torque

    expect([torque?.x, torque?.y, torque?.z]).toEqual([0, 0, 0])
  })

  it('puts the pilot in the seat the camera rides in', () => {
    const plane = bench()
    pushed(plane)

    expect(plane.pilots.leader()?.entity.id).toBe('plane')
  })

  it('says nothing at all when the scene holds no aircraft', () => {
    const physics = notedPhysics()
    const world = testWorld({
      ports: testPorts({ physics }),
      systems: [createAircraftSystem(createPilots(), createIntents())],
    })
    world.step(STEP_SECONDS)

    expect(physics.pushed).toEqual([])
  })
})
