// SPDX-License-Identifier: MIT

import { COMPONENT_DEFAULTS } from '../componentDefaults'
import { componentOf, type Entity } from '../entity'
import { choiceOf, numberOf, textOf } from '../componentFields'
import { entityNamed, stepTowards } from '../steering'
import { advanced, WAYPOINT_MODES, type WaypointCursor } from './advanced'
import type { System, World } from '../world'

const PATROL = COMPONENT_DEFAULTS.Patrol

/** Where a walker is in its round: which mark it wants, which way it goes, and what it waits. */
type Round = WaypointCursor & { waited: number }

/**
 * What walks from one NAMED mark to the next, waiting at each — a sentry, a lift.
 *
 * The marks are entities, not points, and that is the whole difference with `Path`: an author
 * moves the mark in the scene and the sentry follows it, without editing a string of numbers.
 */
export function createPatrolSystem(): System {
  const rounds = new WeakMap<Entity, Round>()
  const marks: Entity[] = []

  const update = (world: World, entity: Entity, dt: number): void => {
    const settings = componentOf(entity, 'Patrol')
    if (!settings) return
    marks.length = 0
    for (const said of textOf(settings, 'waypoints', PATROL.waypoints).split(',')) {
      const name = said.trim()
      const mark = name === '' ? null : entityNamed(world, name)
      if (mark && mark !== entity) marks.push(mark)
    }
    if (marks.length === 0) return
    const round = rounds.get(entity) ?? { at: 0, forward: true, waited: 0, done: false }
    rounds.set(entity, round)
    if (round.done) return
    if (round.waited > 0) {
      round.waited = Math.max(0, round.waited - dt)
      return
    }
    const mark = marks[Math.min(round.at, marks.length - 1)]
    if (!mark) return
    const reach = numberOf(settings, 'speed', PATROL.speed) * dt
    if (!stepTowards(entity.transform.position, mark.transform.position, reach)) return
    round.waited = numberOf(settings, 'waitSeconds', PATROL.waitSeconds)
    advanced(round, marks.length, choiceOf(settings, 'mode', WAYPOINT_MODES, PATROL.mode))
  }

  return {
    name: 'patrol',
    reads: ['Patrol'],
    writes: [],

    fixedUpdate: (world: World, dt: number) => {
      for (const entity of world.entities.withComponent('Patrol')) {
        update(world, entity, dt)
      }
    },
  }
}
