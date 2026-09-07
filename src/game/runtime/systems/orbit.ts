// SPDX-License-Identifier: MIT

import { COMPONENT_DEFAULTS } from '../componentDefaults'
import { componentOf, type Entity } from '../entity'
import { numberOf, textOf } from '../componentFields'
import { DEGREES, FULL_TURN } from '../../numeric'
import { createTargets } from '../steering'
import type { System, World } from '../world'

const ORBIT = COMPONENT_DEFAULTS.Orbit

/**
 * What turns about something else — a moon, a satellite, a circling camera. A target nobody named
 * is the world's ORIGIN, which is what an author means by « turn about there ».
 *
 * The angle is the system's own memory rather than the component's: written back, a ⌘S would save
 * where the moon happened to be, and STOP would not give the author's number back.
 */
export function createOrbitSystem(): System {
  const angles = new WeakMap<Entity, number>()
  const targets = createTargets()

  return {
    name: 'orbit',
    reads: ['Orbit'],
    writes: [],

    fixedUpdate: (world: World, dt: number) => {
      for (const entity of world.entities.withComponent('Orbit')) {
        const settings = componentOf(entity, 'Orbit')
        if (!settings) continue

        const target = targets.of(world, entity, textOf(settings, 'target', ORBIT.target))
        if (target === entity) continue

        const radius = numberOf(settings, 'radius', ORBIT.radius)
        const angle =
          (angles.get(entity) ?? 0) + numberOf(settings, 'speed', ORBIT.speed) * DEGREES * dt
        angles.set(entity, angle % FULL_TURN)

        const centre = target?.transform.position
        entity.transform.position.x = (centre?.x ?? 0) + Math.cos(angle) * radius
        entity.transform.position.y = (centre?.y ?? 0) + numberOf(settings, 'height', ORBIT.height)
        entity.transform.position.z = (centre?.z ?? 0) + Math.sin(angle) * radius
      }
    },
  }
}
