// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import type { EntityPlacement } from '../ports/renderPort'
import { createGameLoop, STEP_SECONDS } from './gameLoop'
import {
  angleBetween,
  eulerFromQuaternion,
  quaternionFromEuler,
  quaternionSlerp,
} from '../physics/quaternion'
import { placementsOf, poseAt } from './placements'
import { restingTransform, type Entity } from './entity'
import type { System, World } from './world'
import { testWorld } from './world-fixtures'

/** A metre of +x a step, and a fifth of a turn about y: something a frame can be caught mid-way. */
const travelling: System = {
  name: 'movement',
  reads: [],
  writes: [],
  fixedUpdate: world => {
    for (const entity of world.entities.all()) {
      entity.transform.position.x += 1
      entity.transform.rotation.y += Math.PI / 5
    }
  },
}

function moving(systems: readonly System[] = [travelling]): World {
  const world = testWorld({ systems })
  world.entities.add({ id: 'crate', name: 'Crate', transform: restingTransform(), components: [] })
  return world
}

describe('what a frame draws between two steps', () => {
  it('draws an entity half way when the frame sits half way', () => {
    const world = moving()
    const into: EntityPlacement[] = []
    world.step(STEP_SECONDS)

    expect(placementsOf(world, into, 0.5)[0]?.transform.position.x).toBeCloseTo(0.5, 6)
    expect(placementsOf(world, into, 1)[0]?.transform.position.x).toBeCloseTo(1, 6)
  })

  /**
   * 🛑 A yaw of 3,1 turning towards −3,1 is a tenth of a turn, not a whole one backwards — blended
   * plainly, a character crossing behind itself spins right round in one frame.
   */
  it('turns the short way round when an angle crosses the half turn', () => {
    const world = moving([])
    const crate = world.entities.get('crate')
    if (crate) crate.transform.rotation.y = Math.PI - 0.1
    world.step(STEP_SECONDS)
    if (crate) crate.transform.rotation.y = -Math.PI + 0.1

    const turned = placementsOf(world, [], 0.5)[0]?.transform.rotation ?? { x: 0, y: 0, z: 0 }

    // The ORIENTATION, never the angles: a half turn about y is also written (−π, 0, −π), and
    // the slerp answers whichever `eulerFromQuaternion` names it. Both face the same way.
    const drawn = quaternionFromEuler(turned, { x: 0, y: 0, z: 0, w: 1 })
    const seam = quaternionFromEuler({ x: 0, y: Math.PI, z: 0 }, { x: 0, y: 0, z: 0, w: 1 })
    expect((angleBetween(drawn, seam) * 180) / Math.PI).toBeLessThan(1)
  })

  /** Nowhere to come FROM: drawing a newborn at the origin makes it flash across the scene. */
  it('draws an entity born since the last step where it stands', () => {
    const world = moving([])
    world.step(STEP_SECONDS)
    world.entities.add({
      id: 'spark',
      name: 'Spark',
      transform: { ...restingTransform(), position: { x: 7, y: 0, z: 0 } },
      components: [],
    })

    const drawn = placementsOf(world, [], 0.5).find(one => one.entity === 'spark')

    expect(drawn?.transform.position.x).toBe(7)
  })

  /**
   * The whole of the judder: at 120 Hz against a 60 Hz step, one frame in two runs no step, and a
   * picture drawn off the entity's own transform stands still then jumps a whole step.
   */
  it('keeps moving on a frame the loop ran no step on', () => {
    const world = moving()
    const into: EntityPlacement[] = []
    const loop = createGameLoop(world)
    loop.advance(0)

    loop.advance(STEP_SECONDS)
    const stepped = placementsOf(world, into, loop.alpha())[0]?.transform.position.x ?? 0
    loop.advance(STEP_SECONDS * 1.5)
    const between = placementsOf(world, into, loop.alpha())[0]?.transform.position.x ?? 0

    expect(loop.advance(STEP_SECONDS * 1.5)).toBe(0)
    expect(between).toBeGreaterThan(stepped)
  })
})

/**
 * 🛑 A plane rolling while pitched steeply crosses the pole of the Euler decomposition, where all
 * three angles jump together. Interpolated angle by angle, the frames between are drawn at an
 * orientation NEITHER pose held — measured at 179,99° off, which reads as a machine with four
 * wings. The rotation is slerped for that reason alone.
 */
describe('a pose drawn between two steep ones', () => {
  it('stays between them rather than flipping to the far side', () => {
    const from = { x: 0, y: 0, z: 0, w: 1 }
    const to = { x: 0, y: 0, z: 0, w: 1 }
    quaternionFromEuler({ x: 0.2, y: (88 * Math.PI) / 180, z: 0.3 }, from)
    quaternionFromEuler({ x: 0.25, y: (91 * Math.PI) / 180, z: 0.35 }, to)

    const entity: Entity = {
      id: 'plane',
      name: 'plane',
      transform: { ...restingTransform(), rotation: eulerFromQuaternion(to, { x: 0, y: 0, z: 0 }) },
      previous: {
        ...restingTransform(),
        rotation: eulerFromQuaternion(from, { x: 0, y: 0, z: 0 }),
      },
      components: [],
    }

    const drawn = poseAt(entity, 0.5, restingTransform())
    const turned = quaternionFromEuler(drawn.rotation, { x: 0, y: 0, z: 0, w: 1 })
    const wanted = quaternionSlerp(from, to, 0.5, { x: 0, y: 0, z: 0, w: 1 })

    expect((angleBetween(turned, wanted) * 180) / Math.PI).toBeLessThan(1)
  })
})
