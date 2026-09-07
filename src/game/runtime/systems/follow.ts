// SPDX-License-Identifier: MIT

import { COMPONENT_DEFAULTS } from '../componentDefaults'
import { componentOf, type Entity } from '../entity'
import { numberOf, textOf } from '../componentFields'
import { createTargets } from '../steering'
import type { System, World } from '../world'

const FOLLOW = COMPONENT_DEFAULTS.Follow

/**
 * What chases something else and stops short of it — a companion, a shoulder camera, an enemy.
 *
 * The pace is held between steps rather than jumping to the full speed: a follower that starts and
 * stops at once reads as a teleport, and the acceleration is what an author tunes to fix it.
 *
 * 🛑 Keyed by the ENTITY and not by its id, like `movement`: a game that spawns and destroys
 * followers would otherwise grow the map for the life of the session, and an id given out again
 * would inherit the dead one's pace.
 */
export function createFollowSystem(): System {
  const paces = new WeakMap<Entity, number>()
  const targets = createTargets()

  const update = (world: World, entity: Entity, dt: number): void => {
    const settings = componentOf(entity, 'Follow')
    if (!settings) return
    const target = targets.of(world, entity, textOf(settings, 'target', FOLLOW.target))
    if (!target || target === entity) return
    const wanted = numberOf(settings, 'speed', FOLLOW.speed)
    const stop = numberOf(settings, 'stopDistance', FOLLOW.stopDistance)
    const acceleration = numberOf(settings, 'acceleration', FOLLOW.acceleration)
    const at = entity.transform.position
    const to = target.transform.position
    const dx = to.x - at.x
    const dy = to.y - at.y
    const dz = to.z - at.z
    const distance = Math.hypot(dx, dy, dz)
    const asked = distance > stop ? wanted : 0
    const held = paces.get(entity) ?? 0
    const change = acceleration * dt
    const pace = held < asked ? Math.min(asked, held + change) : Math.max(asked, held - change)
    paces.set(entity, pace)
    if (pace === 0 || distance === 0) return
    const step = Math.min(pace * dt, Math.max(0, distance - stop))
    at.x += (dx / distance) * step
    at.y += (dy / distance) * step
    at.z += (dz / distance) * step
  }

  return {
    name: 'follow',
    reads: ['Follow'],
    writes: [],

    fixedUpdate: (world: World, dt: number) => {
      for (const entity of world.entities.withComponent('Follow')) {
        update(world, entity, dt)
      }
    },
  }
}
