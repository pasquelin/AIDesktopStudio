import type { AutoRigSkinBinding } from '@shared/domain/autoRig'
import type { Rig } from '@shared/domain/rig'
import type { SceneRenderer } from '@/engines/scene/SceneRenderer'

/** Puts a stored rig back on a model: bound from its saved weights when it has them, fitted otherwise. */
export async function restoreStoredRig(
  engine: Pick<SceneRenderer, 'applyAutoRig' | 'skinModel'>,
  nodeId: string,
  rig: Rig,
  bindings?: readonly AutoRigSkinBinding[],
): Promise<boolean> {
  if (!bindings) {
    await engine.skinModel(nodeId, rig)
    return true
  }
  return engine.applyAutoRig(nodeId, {
    rig,
    bindings,
    metadata: {
      backendId: 'stored',
      sourceInfluences: rig.bones.length,
      outputInfluences: 4,
      fingers: false,
    },
  })
}
