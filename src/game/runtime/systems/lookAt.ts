// SPDX-License-Identifier: MIT

import type { Vector3 } from '@shared/domain/transform'
import { COMPONENT_DEFAULTS } from '../componentDefaults'
import { componentOf } from '../entity'
import { numberOf, textOf } from '../componentFields'
import { DEGREES } from '../../numeric'
import { createTargets, turnTowards } from '../steering'
import type { System, World } from '../world'

const LOOK_AT = COMPONENT_DEFAULTS.LookAt

/**
 * What faces something else — a turret, a sign, a head.
 *
 * A turning speed of zero is INSTANT, which is what a camera mount wants; anything else is a cap
 * in degrees a second, and the turn takes the short way round because it slerps rather than
 * walking three Euler angles.
 */
export function createLookAtSystem(): System {
  const targets = createTargets()

  return {
    name: 'lookAt',
    reads: ['LookAt'],
    writes: [],

    fixedUpdate: (world: World, dt: number) => {
      for (const entity of world.entities.withComponent('LookAt')) {
        const settings = componentOf(entity, 'LookAt')
        if (!settings) continue

        const target = targets.of(world, entity, textOf(settings, 'target', LOOK_AT.target))
        // Nothing to face is a component that does nothing, not one that spins to the origin.
        if (!target || target === entity) continue

        TOWARDS.x = target.transform.position.x - entity.transform.position.x
        TOWARDS.y = target.transform.position.y - entity.transform.position.y
        TOWARDS.z = target.transform.position.z - entity.transform.position.z
        const most = numberOf(settings, 'turnSpeed', LOOK_AT.turnSpeed) * DEGREES * dt
        turnTowards(entity.transform.rotation, TOWARDS, most)
      }
    },
  }
}

/** Reused: a scene of a hundred turrets allocates nothing at all. */
const TOWARDS: Vector3 = { x: 0, y: 0, z: 0 }
