// SPDX-License-Identifier: MIT

import type startJolt from 'jolt-physics/wasm-compat'

type JoltModule = Awaited<ReturnType<typeof startJolt>>
type JoltSettings = InstanceType<JoltModule['JoltSettings']>

/**
 * Which object layer a body goes in, and which pairs may meet. 🛑 Jolt asks for three filters,
 * and a world built without them collides nothing at all.
 */
export const NON_MOVING = 0
export const MOVING = 1

const OBJECT_LAYERS = 2
const BROAD_PHASE_LAYERS = 2

/**
 * Fills the three filters in. They are NOT destroyed here: `JoltInterface` takes them over and
 * reads them for the life of the world.
 */
export function layerJoltSettings(jolt: JoltModule, settings: JoltSettings): void {
  const pairs = new jolt.ObjectLayerPairFilterTable(OBJECT_LAYERS)
  // Two resting bodies never meet, and asking the broadphase to watch a pair it would skip is
  // work for an event nobody can receive.
  pairs.EnableCollision(NON_MOVING, MOVING)
  pairs.EnableCollision(MOVING, MOVING)

  const broad = new jolt.BroadPhaseLayerInterfaceTable(OBJECT_LAYERS, BROAD_PHASE_LAYERS)
  // Destroyed straight after: the table copies the value, and two orphans a world is exactly the
  // kind of leak this port is meant not to have.
  for (const layer of [NON_MOVING, MOVING]) {
    const broadLayer = new jolt.BroadPhaseLayer(layer)
    broad.MapObjectToBroadPhaseLayer(layer, broadLayer)
    jolt.destroy(broadLayer)
  }

  settings.mObjectLayerPairFilter = pairs
  settings.mBroadPhaseLayerInterface = broad
  settings.mObjectVsBroadPhaseLayerFilter = new jolt.ObjectVsBroadPhaseLayerFilterTable(
    broad,
    BROAD_PHASE_LAYERS,
    pairs,
    OBJECT_LAYERS,
  )
}
