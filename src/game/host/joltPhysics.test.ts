// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { BodyDescriptor, PhysicsPort } from '../ports/physicsPort'
import { describedBody as body, restingAt as at } from '../physics/physics-fixtures'
import { joltFreeBytes, loadJoltPhysics } from './joltPhysics'
import {
  FLOOR,
  GROUND_PRESS,
  ORIGIN,
  QUAD,
  STEP,
  STAIR_RUN,
  STAIR_STEPS,
  WALK_PACE,
  flight,
  poseOf,
  pierced,
  run,
  shoved,
} from './joltPhysics-fixtures'

const leakBodies = (): BodyDescriptor[] => [
  body({ body: 'floor', kind: 'fixed', shape: FLOOR, transform: at(0, -0.5, 0) }),
  body({
    body: 'lift',
    kind: 'kinematic',
    shape: { kind: 'cuboid', hx: 2, hy: 0.25, hz: 2 },
    transform: at(6, 1, 0),
  }),
  body({
    body: 'walker',
    kind: 'kinematic',
    shape: { kind: 'capsule', halfHeight: 0.6, radius: 0.3 },
    transform: at(0, 0.9, 0),
    character: { stepHeight: 0.5, slopeLimit: 45, snapDistance: 0.5 },
  }),
  ...Array.from({ length: 40 }, (_, index) =>
    body({
      body: `crate${index}`,
      shape: { kind: 'cuboid', hx: 0.3, hy: 0.3, hz: 0.3 },
      transform: at((index % 8) * 0.8 - 3, 1 + Math.floor(index / 8) * 0.8, 2),
    }),
  ),
]
describe('the physics as Jolt fills it', () => {
  let port: PhysicsPort

  beforeEach(async () => {
    port = await loadJoltPhysics()
    port.setGravity(-9.81)
  })

  afterEach(() => {
    port.dispose()
  })

  it('drops a box onto a floor and leaves it standing there', () => {
    port.add([
      body({ body: 'floor', kind: 'fixed', shape: FLOOR, transform: at(0, -0.5, 0) }),
      body({
        body: 'crate',
        shape: { kind: 'cuboid', hx: 0.5, hy: 0.5, hz: 0.5 },
        transform: at(0, 5, 0),
      }),
    ])

    const landed = run(port, 180, 'crate')

    expect(landed.y).toBeGreaterThan(0.4)
    expect(landed.y).toBeLessThan(0.6)
  })

  it('says nothing of a body that has settled', () => {
    port.add([
      body({ body: 'floor', kind: 'fixed', shape: FLOOR, transform: at(0, -0.5, 0) }),
      body({ body: 'crate', shape: { kind: 'ball', radius: 0.5 }, transform: at(0, 1, 0) }),
    ])

    run(port, 600, 'crate')

    expect(poseOf(port, 'crate')).toBeNull()
  })

  it('refuses a body whose points enclose nothing, by name', () => {
    const refused = port.add([
      body({ body: 'flat', shape: { kind: 'hull', points: new Float32Array([0, 0, 0, 1, 0, 0]) } }),
    ])

    expect(refused).toEqual(['flat'])
  })

  it('refuses a mesh that would have to move, and takes the same mesh standing still', () => {
    const refused = port.add([
      body({ body: 'ground', kind: 'fixed', shape: { kind: 'trimesh', ...QUAD } }),
      body({ body: 'flying', kind: 'dynamic', shape: { kind: 'trimesh', ...QUAD } }),
    ])

    expect(refused).toEqual(['flying'])
  })

  it('walks a character up to a wall and no further', () => {
    port.add([
      body({ body: 'floor', kind: 'fixed', shape: FLOOR, transform: at(0, -0.5, 0) }),
      body({
        body: 'wall',
        kind: 'fixed',
        shape: { kind: 'cuboid', hx: 5, hy: 2, hz: 0.5 },
        transform: at(0, 2, -4),
      }),
      body({
        body: 'walker',
        kind: 'kinematic',
        shape: { kind: 'capsule', halfHeight: 0.6, radius: 0.3 },
        transform: at(0, 0.9, 0),
        character: { stepHeight: 0.5, slopeLimit: 45, snapDistance: 0.5 },
      }),
    ])

    for (let step = 0; step < 300; step++) {
      port.moveCharacters([{ body: 'walker', wanted: { x: 0, y: -0.05, z: -0.05 }, facing: null }])
      port.step(STEP)
    }

    const walker = poseOf(port, 'walker')
    expect(walker?.position.z ?? 0).toBeGreaterThan(-3.5)
    expect(walker?.position.y ?? 0).toBeGreaterThan(0.5)
  })

  it('stops a probe on the near face of a wall, and answers nothing down a clear way', () => {
    port.add([
      body({
        body: 'wall',
        kind: 'fixed',
        shape: { kind: 'cuboid', hx: 0.5, hy: 3, hz: 3 },
        transform: at(5, 0, 0),
      }),
    ])

    expect(port.cast(ORIGIN, { x: 10, y: 0, z: 0 }, 0, [])).toBeCloseTo(0.45, 2)
    expect(port.cast(ORIGIN, { x: 0, y: 0, z: 10 }, 0, [])).toBeNull()
  })

  it('leaves out the bodies it is told to ignore', () => {
    port.add([
      body({
        body: 'near',
        kind: 'fixed',
        shape: { kind: 'cuboid', hx: 0.5, hy: 3, hz: 3 },
        transform: at(2, 0, 0),
      }),
      body({
        body: 'far',
        kind: 'fixed',
        shape: { kind: 'cuboid', hx: 0.5, hy: 3, hz: 3 },
        transform: at(6, 0, 0),
      }),
    ])

    expect(port.cast(ORIGIN, { x: 10, y: 0, z: 0 }, 0, [])).toBeCloseTo(0.15, 2)
    expect(port.cast(ORIGIN, { x: 10, y: 0, z: 0 }, 0, ['near'])).toBeCloseTo(0.55, 2)
  })

  it('stops a thick probe on the slot a ray of no thickness goes through', () => {
    port.add([
      body({
        body: 'left',
        kind: 'fixed',
        shape: { kind: 'cuboid', hx: 0.5, hy: 3, hz: 1.5 },
        transform: at(5, 0, 1.6),
      }),
      body({
        body: 'right',
        kind: 'fixed',
        shape: { kind: 'cuboid', hx: 0.5, hy: 3, hz: 1.5 },
        transform: at(5, 0, -1.6),
      }),
    ])

    expect(port.cast(ORIGIN, { x: 10, y: 0, z: 0 }, 0, [])).toBeNull()
    expect(port.cast(ORIGIN, { x: 10, y: 0, z: 0 }, 0.3, [])).toBeCloseTo(0.4217, 3)
  })

  it('is not stopped by a sensor, which is what a sensor means', () => {
    port.add([
      body({
        body: 'zone',
        kind: 'fixed',
        sensor: true,
        shape: { kind: 'cuboid', hx: 0.5, hy: 3, hz: 3 },
        transform: at(2, 0, 0),
      }),
      body({
        body: 'wall',
        kind: 'fixed',
        shape: { kind: 'cuboid', hx: 0.5, hy: 3, hz: 3 },
        transform: at(6, 0, 0),
      }),
    ])

    expect(port.cast(ORIGIN, { x: 10, y: 0, z: 0 }, 0, [])).toBeCloseTo(0.55, 2)
  })

  it('gives back every byte a cast took, frame after frame', async () => {
    port.add([
      body({
        body: 'wall',
        kind: 'fixed',
        shape: { kind: 'cuboid', hx: 0.5, hy: 3, hz: 3 },
        transform: at(5, 0, 0),
      }),
    ])

    const marks: number[] = []
    for (let cycle = 0; cycle < 5; cycle++) {
      for (let frame = 0; frame < 60; frame++) {
        port.cast(ORIGIN, { x: 10, y: 0, z: 0 }, 0.3, ['wall'])
        port.cast(ORIGIN, { x: 10, y: 0, z: 0 }, 0, [])
      }
      marks.push(await joltFreeBytes())
    }

    expect(Math.max(...marks) - Math.min(...marks)).toBeLessThanOrEqual(8)
  })
})

describe('characters, sensors and sustained worlds', () => {
  let port: PhysicsPort

  beforeEach(async () => {
    port = await loadJoltPhysics()
    port.setGravity(-9.81)
  })

  afterEach(() => {
    port.dispose()
  })

  it('walks a character up a flight of steps and onto the landing above them', () => {
    port.add([
      body({ body: 'floor', kind: 'fixed', shape: FLOOR, transform: at(0, -0.5, 0) }),
      ...flight(),
      body({
        body: 'walker',
        kind: 'kinematic',
        shape: { kind: 'capsule', halfHeight: 0.6, radius: 0.3 },
        transform: at(-1, 0.9, 0),
        character: { stepHeight: 0.5, slopeLimit: 45, snapDistance: 0.5 },
      }),
    ])

    for (let step = 0; step < 120; step++) {
      port.moveCharacters([
        { body: 'walker', wanted: { x: WALK_PACE, y: GROUND_PRESS, z: 0 }, facing: null },
      ])
      port.step(STEP)
    }

    const walker = poseOf(port, 'walker')
    expect(walker?.position.y ?? 0).toBeGreaterThan(3.3)
    expect(walker?.position.x ?? 0).toBeGreaterThan(STAIR_STEPS * STAIR_RUN)
  })

  it('says a character is grounded when it stands on something, and not when it does not', () => {
    port.add([
      body({ body: 'floor', kind: 'fixed', shape: FLOOR, transform: at(0, -0.5, 0) }),
      body({
        body: 'walker',
        kind: 'kinematic',
        shape: { kind: 'capsule', halfHeight: 0.6, radius: 0.3 },
        transform: at(0, 0.9, 0),
        character: { stepHeight: 0.5, slopeLimit: 45, snapDistance: 0.5 },
      }),
      body({
        body: 'flyer',
        kind: 'kinematic',
        shape: { kind: 'capsule', halfHeight: 0.6, radius: 0.3 },
        transform: at(6, 20, 0),
        character: { stepHeight: 0.5, slopeLimit: 45, snapDistance: 0.5 },
      }),
    ])

    port.step(STEP)
    const moved = port.moveCharacters([
      { body: 'walker', wanted: { x: 0, y: -0.02, z: 0 }, facing: null },
      { body: 'flyer', wanted: { x: 0, y: -0.02, z: 0 }, facing: null },
    ])

    expect(moved.find(one => one.body === 'walker')?.grounded).toBe(true)
    expect(moved.find(one => one.body === 'flyer')?.grounded).toBe(false)
  })

  it('reports a sensor being entered, from both sides and marked as sensed', () => {
    port.add([
      body({
        body: 'gate',
        kind: 'fixed',
        sensor: true,
        shape: { kind: 'cuboid', hx: 2, hy: 2, hz: 2 },
        transform: at(0, 0, 0),
      }),
      body({
        body: 'crate',
        shape: { kind: 'cuboid', hx: 0.5, hy: 0.5, hz: 0.5 },
        transform: at(0, 4, 0),
      }),
    ])

    const met: string[] = []
    for (let step = 0; step < 120; step++) {
      port.step(STEP)
      for (const contact of port.contacts()) {
        if (contact.started && contact.sensed) met.push(`${contact.body}|${contact.other}`)
      }
    }

    expect(met).toContain('gate|crate')
    expect(met).toContain('crate|gate')
  })

  it('leaves a sensor where the game puts it, however its author declared it', () => {
    port.add([
      body({
        body: 'gate',
        sensor: true,
        shape: { kind: 'cuboid', hx: 1, hy: 1, hz: 1 },
        transform: at(0, 2, 0),
      }),
    ])

    port.place([
      { body: 'gate', position: { x: 0, y: 6, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } },
    ])
    run(port, 60, 'gate')

    expect(poseOf(port, 'gate')).toBeNull()
  })

  it('weighs a body once however many pieces it is felt as', async () => {
    const light = await shoved(1, 4)
    const heavy = await shoved(1, 16)
    const split = await shoved(4, 4)

    expect(Math.abs(heavy - light)).toBeGreaterThan(1)
    expect(split).toBeCloseTo(light, 3)
  })

  it('refuses by name once the body manager is full, and leaves the bodies it holds alone', () => {
    port.add([
      body({ body: 'floor', kind: 'fixed', shape: FLOOR, transform: at(0, -0.5, 0) }),
      body({
        body: 'crate',
        shape: { kind: 'cuboid', hx: 0.5, hy: 0.5, hz: 0.5 },
        transform: at(0, 5, 0),
      }),
    ])

    const crowd = Array.from({ length: 16600 }, (_, index) =>
      body({
        body: `box${index}`,
        kind: 'fixed',
        shape: { kind: 'cuboid', hx: 0.1, hy: 0.1, hz: 0.1 },
        transform: at(10, index * 0.5, 10),
      }),
    )
    const refused = port.add(crowd)

    expect(refused.length).toBeGreaterThan(0)
    expect(refused.every(name => name.startsWith('box'))).toBe(true)
    expect(run(port, 180, 'crate').y).toBeGreaterThan(0)
  })

  it('lets a body through the hole of a compound of convex pieces', () => {
    port.add([
      body({
        body: 'wall',
        kind: 'fixed',
        shape: { kind: 'convexes', parts: pierced() },
        transform: at(0, 0, 0),
      }),
      body({ body: 'crate', shape: { kind: 'ball', radius: 0.2 }, transform: at(0, 4, 0) }),
    ])

    const fallen = run(port, 180, 'crate')

    expect(fallen.y).toBeLessThan(-1)
  })

  it('holds a kinematic body where it was last placed, on the steps that say nothing', () => {
    port.add([
      body({
        body: 'lift',
        kind: 'kinematic',
        shape: { kind: 'cuboid', hx: 2, hy: 0.25, hz: 2 },
        transform: at(0, 2, 0),
      }),
      body({ body: 'crate', shape: { kind: 'ball', radius: 0.25 }, transform: at(0, 3, 0) }),
    ])

    port.place([
      { body: 'lift', position: { x: 0, y: 2, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } },
    ])
    const rested = run(port, 240, 'crate')

    expect(rested.y).toBeGreaterThan(2.4)
    expect(rested.y).toBeLessThan(2.6)
  })

  it('gives back every byte it took over a thousand steps', async () => {
    port.add(leakBodies())

    const frame = (turn: number): void => {
      port.place([
        {
          body: 'lift',
          position: { x: 6, y: 1 + Math.sin(turn * 0.1) * 0.2, z: 0 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
        },
      ])
      port.moveCharacters([{ body: 'walker', wanted: { x: 0.01, y: -0.02, z: 0 }, facing: null }])
      port.step(STEP)
      port.poses()
      port.contacts()
    }

    const marks: number[] = []
    for (let window = 0; window < 4; window++) {
      for (let turn = 0; turn < 500; turn++) frame(window * 500 + turn)
      marks.push(await joltFreeBytes())
    }

    expect(marks.slice(1)).toEqual([marks[0], marks[0], marks[0]])
  })
})
