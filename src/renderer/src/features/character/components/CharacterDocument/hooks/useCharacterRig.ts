import { useEffect } from 'react'
import { dressCharacterStage } from '@/character/characterStage'
import { restoreStoredRig } from '@/character/restoreStoredRig'
import type { SceneRenderer } from '@/engines/scene/SceneRenderer'
import type { characterOf } from '@/stores/character'

/**
 * 🛑 The skeleton the store holds, put ON the model — once the model has landed. Without this a
 * fitted rig lives in a state nobody draws, no weights are ever worked out, and ⌘S writes bones
 * bound to nothing.
 */
export function useCharacterRig(
  engine: SceneRenderer | null,
  assetId: string,
  nodeId: string | undefined,
  landed: boolean,
  character: ReturnType<typeof characterOf>,
): void {
  useEffect(() => {
    if (!engine || !nodeId || !landed) return
    if (!character.rig) {
      engine.clearRig(nodeId)
      return
    }
    void restoreStoredRig(engine, nodeId, character.rig, character.autoRigBindings)
  }, [engine, character.rig, character.autoRigBindings, nodeId, landed])

  useEffect(() => {
    dressCharacterStage(assetId, character.dress)
  }, [assetId, character.dress])
}
