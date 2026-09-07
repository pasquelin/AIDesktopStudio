// SPDX-License-Identifier: MIT

import { bench } from '@shared/vitestBench'

import { describe } from 'vitest'
import { STEP_SECONDS } from './gameLoop'
import type { System, World } from './world'
import { testWorld } from './world-fixtures'

/**
 * What one fixed step costs before anything draws.
 *
 * The frame is 16,7 ms and the measurements of 2026-08-26 already spend 1,42 ms of it on 500
 * physics bodies and 200 scripted entities. This says what the world itself takes on top — the
 * sweep of an indexed store and the ordered walk of the systems, with no rendering at all.
 *
 * Measured 2026-08-26 on this Mac: **0,0026 ms** a step for a thousand entities (p99 0,0060) and
 * 0,0213 ms for ten thousand — 0,016 % of the frame, and it scales with the entities the index
 * SELECTS rather than with the scene. Nothing here is the thing to optimise.
 *
 * A second pass after the review's fixes read 0,0027 min for a thousand, but on a machine running
 * three other sessions: ±13 % against ±0,13 %. **Read both as « under three microseconds », never
 * as a difference** — the two were not measured under the same load.
 */
const drift: System = {
  name: 'movement',
  reads: ['Movement'],
  writes: ['Movement'],
  fixedUpdate: (world, dt) => {
    for (const entity of world.entities.withComponent('Movement')) {
      entity.transform.position.x += dt
    }
  },
}

/** Half carry the component the system reads, so the INDEX is what the figure measures. */
const filled = (count: number): World => {
  const world = testWorld({ systems: [drift] })
  for (let index = 0; index < count; index++) {
    world.entities.add({
      id: `e${index}`,
      name: `e${index}`,
      transform: {
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      components: index % 2 === 0 ? [{ type: 'Movement', speed: 1 }] : [],
    })
  }
  return world
}

describe('one fixed step', () => {
  const thousand = filled(1000)
  const tenThousand = filled(10_000)

  bench('1 000 entities, half of them moving', () => {
    thousand.step(STEP_SECONDS)
  })

  bench('10 000 entities, half of them moving', () => {
    tenThousand.step(STEP_SECONDS)
  })
})
