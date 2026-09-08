// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import { STEP_SECONDS } from './gameLoop'
import type { System, World } from './world'
import { testWorld } from './world-fixtures'

const ENTITIES = 1000
const STEPS = 10_000

/**
 * Draws for every entity it moves, so the world's luck and its arithmetic both take part. A system
 * that only added a constant would pass this test with a broken generator.
 */
const drift: System = {
  name: 'movement',
  reads: ['Movement'],
  writes: ['Movement'],
  fixedUpdate: (world, dt) => {
    for (const entity of world.entities.withComponent('Movement')) {
      entity.transform.position.x += (world.random.next() - 0.5) * dt
      entity.transform.position.y += (world.random.next() - 0.5) * dt
    }
  },
}

const ranWorld = (seed: number): World => {
  const world = testWorld({ systems: [drift], seed })
  for (let index = 0; index < ENTITIES; index++) {
    world.entities.add({
      id: `e${index}`,
      name: `e${index}`,
      transform: {
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      components: [{ type: 'Movement', speed: 1 }],
    })
  }

  for (let step = 0; step < STEPS; step++) world.step(STEP_SECONDS)
  return world
}

/** By VALUE, not by shape: two worlds agreeing on their tick count prove nothing. */
const valueOf = (world: World): string =>
  JSON.stringify({
    tick: world.time.tick,
    elapsed: world.time.elapsed,
    luck: world.random.state(),
    entities: [...world.entities.all()].map(one => [one.id, one.transform.position]),
  })

describe('a world of a thousand entities over ten thousand steps', () => {
  it('reaches the same state, by value, for the same seed — and another for another', () => {
    const once = valueOf(ranWorld(42))

    expect(valueOf(ranWorld(42))).toBe(once)
    expect(valueOf(ranWorld(43))).not.toBe(once)
  })
})
