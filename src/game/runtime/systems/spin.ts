// SPDX-License-Identifier: MIT

import { COMPONENT_DEFAULTS } from '../componentDefaults'
import { componentOf } from '../entity'
import { numberOf, textOf } from '../componentFields'
import { DEGREES, FULL_TURN } from '../../numeric'
import type { System, World } from '../world'

const SPIN = COMPONENT_DEFAULTS.Spin

/** A hair over a full turn, so a session spent spinning does not walk the angle into large floats. */

/** What turns on its own and never stops — a pickup, a propeller, a mechanism. */
export function createSpinSystem(): System {
  return {
    name: 'spin',
    reads: ['Spin'],
    writes: [],

    fixedUpdate: (world: World, dt: number) => {
      for (const entity of world.entities.withComponent('Spin')) {
        const spin = componentOf(entity, 'Spin')
        if (!spin) continue

        const said = textOf(spin, 'axis', SPIN.axis)
        const axis = said === 'x' || said === 'z' ? said : 'y'
        const turned =
          entity.transform.rotation[axis] + numberOf(spin, 'speed', SPIN.speed) * DEGREES * dt
        // Wrapped, as the character's yaw is: past a few million radians a float stops resolving
        // a degree, and the spin visibly steps.
        entity.transform.rotation[axis] = turned % FULL_TURN
      }
    },
  }
}
