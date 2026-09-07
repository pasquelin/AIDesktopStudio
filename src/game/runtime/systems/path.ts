// SPDX-License-Identifier: MIT

import type { Vector3 } from '@shared/domain/transform'
import { COMPONENT_DEFAULTS } from '../componentDefaults'
import { componentOf, type Entity } from '../entity'
import { choiceOf, flagOf, numberOf, textOf } from '../componentFields'
import { pointsOf, stepTowards, turnTowards } from '../steering'
import { advanced, WAYPOINT_MODES, type WaypointCursor } from './advanced'
import type { System, World } from '../world'

const PATH = COMPONENT_DEFAULTS.Path

/** Where a traveller is on its rail: which point it wants, which way it goes, and whether it is done. */
type Run = WaypointCursor

/**
 * What runs along a rail of POINTS at a steady pace — a cart, a dolly shot, a platform on rails.
 *
 * Points rather than named marks, unlike `Patrol`: a rail is a shape, not a set of objects, and an
 * author who moves one of its corners is editing the shape.
 */
export function createPathSystem(): System {
  const runs = new WeakMap<Entity, Run>()
  // 🛑 By ENTITY, not by the written rail: keyed by the string, an author typing in the field
  // added one parsed rail per keystroke and the map held them for the life of the system.
  const rails = new WeakMap<Entity, { said: string; rail: readonly Vector3[] }>()

  const update = (entity: Entity, dt: number): void => {
    const settings = componentOf(entity, 'Path')
    if (!settings) return
    const said = textOf(settings, 'waypoints', PATH.waypoints)
    const kept = rails.get(entity)
    const rail = kept?.said === said ? kept.rail : pointsOf(said)
    rails.set(entity, { said, rail })
    if (rail.length === 0) return
    const run = runs.get(entity) ?? { at: 0, forward: true, done: false }
    runs.set(entity, run)
    if (run.done) return
    const point = rail[Math.min(run.at, rail.length - 1)]
    if (!point) return
    if (flagOf(settings, 'orientToTangent', PATH.orientToTangent)) {
      TOWARDS.x = point.x - entity.transform.position.x
      TOWARDS.y = point.y - entity.transform.position.y
      TOWARDS.z = point.z - entity.transform.position.z
      turnTowards(entity.transform.rotation, TOWARDS, 0)
    }
    const reach = numberOf(settings, 'speed', PATH.speed) * dt
    if (!stepTowards(entity.transform.position, point, reach)) return
    advanced(run, rail.length, choiceOf(settings, 'mode', WAYPOINT_MODES, PATH.mode))
  }

  return {
    name: 'path',
    reads: ['Path'],
    writes: [],

    fixedUpdate: (world: World, dt: number) => {
      for (const entity of world.entities.withComponent('Path')) {
        update(entity, dt)
      }
    },
  }
}

/** Reused: a scene of fifty carts allocates nothing at all. */
const TOWARDS: Vector3 = { x: 0, y: 0, z: 0 }
