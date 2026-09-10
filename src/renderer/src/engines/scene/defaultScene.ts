import { EMPTY_TIMELINE } from '@shared/domain/animation'
import { LIGHT_TYPES } from './lightTypes'
import { lightNode } from './nodeFactory'
import {
  DEFAULT_WORLD,
  type LightDescriptor,
  type SceneWorld,
  type Vector3,
} from '@shared/domain/scene'
import type { SceneState } from './sceneState'

/**
 * What a scene MADE from now on opens on, against `DEFAULT_WORLD`, which is what a scene READ
 * off a file falls back to. The two are deliberately apart: a document written before this
 * keeps the picture it was authored under, and only a new one gets the newer curve.
 *
 * AgX and not ACES: three 0.185 ships both, and AgX is the one that holds a saturated colour
 * together as it brightens where ACES turns it toward white. Verified in `three/src/constants.js`
 * on 2026-09-10 — `AgXToneMapping` is 6 and `worldBinding` maps it.
 */
export const NEW_SCENE_WORLD: SceneWorld = { ...DEFAULT_WORLD, toneMapping: 'agx' }

/** Which lights a new scene opens with, and where. A kind absent here is simply not one of them. */
const DEFAULT_LIGHT_POSITIONS: ReadonlyMap<LightDescriptor['kind'], Vector3> = new Map([
  ['ambient', { x: 0, y: 0, z: 0 }],
  ['directional', { x: 5, y: 10, z: 7.5 }],
  ['hemisphere', { x: 0, y: 10, z: 0 }],
])

/** A new scene is born lit: an unlit one reads as a broken viewport, not as an empty document. */
export function createDefaultScene(): SceneState {
  return {
    nodes: LIGHT_TYPES.flatMap(type => {
      const position = DEFAULT_LIGHT_POSITIONS.get(type.kind)
      return position ? [lightNode(type.create(), position)] : []
    }),
    selectedIds: [],
    world: NEW_SCENE_WORLD,
    animation: EMPTY_TIMELINE,
  }
}
