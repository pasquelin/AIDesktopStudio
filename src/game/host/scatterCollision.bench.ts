// SPDX-License-Identifier: MIT

import { bench } from '@shared/vitestBench'

import { describe } from 'vitest'
import { IDENTITY_TRANSFORM } from '@shared/domain/transform'
import type { BodyDescriptor } from '../ports/physicsPort'
import { loadJoltPhysics } from './joltPhysics'

const COUNTS = [512, 1024, 2048, 4096]

function capsules(count: number): BodyDescriptor[] {
  return Array.from({ length: count }, (_, index) => ({
    body: `scatter-${index}`,
    kind: 'fixed',
    shape: { kind: 'capsule', halfHeight: 0.65, radius: 0.35 },
    transform: {
      ...IDENTITY_TRANSFORM,
      position: { x: index % 64, y: 1, z: Math.floor(index / 64) },
    },
    friction: 0.5,
    restitution: 0,
    mass: 0,
    gravityScale: 1,
    lockRotation: false,
    sensor: false,
    character: null,
    vehicle: null,
  }))
}

describe('scatter capsule creation and removal in Jolt', async () => {
  const port = await loadJoltPhysics()
  for (const count of COUNTS) {
    const bodies = capsules(count)
    const ids = bodies.map(body => body.body)
    bench(`${count} fixed capsules`, () => {
      port.add(bodies)
      port.remove(ids)
    })
  }
})

describe('one Jolt step around scatter capsules', async () => {
  for (const count of COUNTS) {
    const port = await loadJoltPhysics()
    port.add(capsules(count))
    bench(`${count} fixed capsules`, () => {
      port.step(1 / 60)
    })
  }
})
