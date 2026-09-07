// SPDX-License-Identifier: MIT

import type { BodyDescriptor, PhysicsPort } from '../ports/physicsPort'
import type { ColliderShape } from '../physics/shape'
import { describedBody as body, restingAt as at } from '../physics/physics-fixtures'
import { loadJoltPhysics } from './joltPhysics'

export const STEP = 1 / 60

export const FLOOR: ColliderShape = { kind: 'cuboid', hx: 20, hy: 0.5, hz: 20 }

export const ORIGIN = { x: 0, y: 0, z: 0 }

export const poseOf = (port: PhysicsPort, name: string) =>
  [...port.poses()].find(pose => pose.body === name) ?? null

/** Runs `count` steps and answers where `name` ended up, or nothing if it never moved. */
export function run(
  port: PhysicsPort,
  count: number,
  name: string,
): { x: number; y: number; z: number } {
  let last = { x: 0, y: 0, z: 0 }
  for (let step = 0; step < count; step++) {
    port.step(STEP)
    const pose = poseOf(port, name)
    if (pose) last = { ...pose.position }
  }
  return last
}

/** A flat quad as two triangles: the least a mesh can be, and enough to be refused for moving. */
export const QUAD = {
  vertices: new Float32Array([-2, 0, -2, 2, 0, -2, 2, 0, 2, -2, 0, 2]),
  indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
}

/** The playground's own stair, as `courtStair` derives it: eight risers of 0,3125 m, 0,6 m of run. */
const STAIR_RISE = 0.3125
export const STAIR_RUN = 0.6
export const STAIR_STEPS = 8

/** Metres a step at the pace a scene ships with, and the press a grounded character is held at. */
export const WALK_PACE = 4 / 60
export const GROUND_PRESS = -1 / 60

/** A flight climbing towards +x, each step a slab from the floor up to its own tread, then a landing. */
export function flight(): BodyDescriptor[] {
  const steps = Array.from({ length: STAIR_STEPS }, (_, index) => {
    const top = (index + 1) * STAIR_RISE
    return body({
      body: `step${index}`,
      kind: 'fixed',
      shape: { kind: 'cuboid', hx: STAIR_RUN / 2, hy: top / 2, hz: 2 },
      transform: at(index * STAIR_RUN + STAIR_RUN / 2, top / 2, 0),
    })
  })

  const height = STAIR_STEPS * STAIR_RISE
  steps.push(
    body({
      body: 'landing',
      kind: 'fixed',
      shape: { kind: 'cuboid', hx: 2, hy: height / 2, hz: 2 },
      transform: at(STAIR_STEPS * STAIR_RUN + 2, height / 2, 0),
    }),
  )
  return steps
}

export async function shoved(pieces: number, mass: number): Promise<number> {
  const port = await loadJoltPhysics()
  port.setGravity(-9.81)
  port.add([
    body({
      body: 'floater',
      shape: { kind: 'ball', radius: 0.5 },
      transform: at(0, 1, 0),
      gravityScale: 0,
      mass: 1,
    }),
    body({
      body: 'weight',
      shape: { kind: 'convexes', parts: Array.from({ length: pieces }, cube) },
      transform: at(0, 4, 0),
      mass,
    }),
  ])
  for (let step = 0; step < 120; step++) port.step(STEP)
  const driven = 1 - ([...port.poses()].find(pose => pose.body === 'floater')?.position.y ?? 1)
  port.dispose()
  return driven
}

const cube = (): Float32Array =>
  new Float32Array([
    -0.5, -0.5, -0.5, 0.5, -0.5, -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, -0.5, -0.5, 0.5, 0.5, -0.5,
    0.5, -0.5, 0.5, 0.5, 0.5, 0.5, 0.5,
  ])

export function pierced(): Float32Array[] {
  const bar = (x: number, z: number, hx: number, hz: number): Float32Array => {
    const points: number[] = []
    for (const dx of [-hx, hx])
      for (const dy of [-0.1, 0.1]) {
        for (const dz of [-hz, hz]) points.push(x + dx, dy, z + dz)
      }
    return new Float32Array(points)
  }
  return [bar(-1, 0, 0.5, 1.5), bar(1, 0, 0.5, 1.5), bar(0, -1, 0.5, 0.5), bar(0, 1, 0.5, 0.5)]
}
