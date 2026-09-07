// SPDX-License-Identifier: MIT

import type { Transform, Vector3 } from '@shared/domain/transform'
import { COMPONENT_DEFAULTS } from '../componentDefaults'
import { textOf } from '../componentFields'
import { componentOf, copyAxes, type Entity } from '../entity'
import type { Possessions } from '../possessions'
import { createTargets } from '../steering'
import type { System, World } from '../world'

const PLAYER = COMPONENT_DEFAULTS.Player

export type PossessionOptions = {
  possessions: Possessions
  /** The walking body of a module, resolved from the TREE — which the runtime does not hold. */
  bodyIdOf: (moduleId: string) => string | null
  worldOf: (entity: Entity, own: Transform) => Transform
  /** A world pose written back into a node's own frame — nothing when it hangs from nothing. */
  localOf: (entity: Entity, position: Vector3, rotation: Vector3) => Transform | null
}

/**
 * What a player RIDES: its body stops walking and is CARRIED by what it rides. 🛑 Carried and
 * never reparented — `hierarchy` composes off the document's tree, which a game does not rewrite
 * (measured). The camera follows for free: the arm watches the body, and the body is on the car.
 */
export function createPossessionSystem(options: PossessionOptions): System {
  const { possessions, bodyIdOf, worldOf, localOf } = options
  const ridden = createTargets()
  const carried: [Entity, Entity][] = []

  const resolve = (world: World): void => {
    possessions.release()
    carried.length = 0

    for (const module of world.entities.withComponent('Player')) {
      const settings = componentOf(module, 'Player')
      const bodyId = settings && bodyIdOf(module.id)
      const body = bodyId === null || bodyId === undefined ? null : world.entities.get(bodyId)
      if (!settings || !body) continue

      const rides = ridden.of(world, module, textOf(settings, 'possesses', PLAYER.possesses))
      // A player naming its own body rides nothing, and walks: the ordinary case, said plainly.
      if (!rides || rides === body) continue

      possessions.hold(body.id)
      carried.push([body, rides])
    }
  }

  return {
    name: 'possession',
    reads: ['Player'],
    writes: [],

    fixedUpdate: resolve,

    // The pairing is the STEP's; only the places are re-read. A frame the accumulator ran no step
    // of still carries — what it rides has moved, and who rides what has not.
    lateUpdate: () => {
      for (const [body, rides] of carried) {
        const seat = worldOf(rides, rides.transform)
        const local = localOf(body, seat.position, body.transform.rotation)
        copyAxes(body.transform.position, local?.position ?? seat.position)
      }
    },
  }
}
