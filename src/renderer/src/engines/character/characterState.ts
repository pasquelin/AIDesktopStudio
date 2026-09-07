import type { CharacterSocket, MotionRef } from '@shared/domain/character'
import type { Rig } from '@shared/domain/rig'
import type { ModelDressRef } from '@shared/domain/scene'
import type { AutoRigSkinBinding } from '@shared/domain/autoRig'

/**
 * A character as the skeleton window holds it: its own file, and nothing of any scene.
 *
 * Flat, and that is the point — the window edits ONE character, so a state keyed by node would
 * carry a parameter that always holds the same value.
 */
export type CharacterState = {
  /** The catalogue row whose `.glb` this is. Empty until the window has been told. */
  assetId: string
  rig: Rig | null
  autoRigBindings?: readonly AutoRigSkinBinding[]
  sockets: readonly CharacterSocket[]
  motions: readonly MotionRef[]
  dress?: ModelDressRef
}

export const EMPTY_CHARACTER: CharacterState = {
  assetId: '',
  rig: null,
  sockets: [],
  motions: [],
}
