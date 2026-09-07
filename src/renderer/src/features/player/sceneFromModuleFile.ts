import { glbChunksOf } from '@shared/domain/glbContainer'
import { sceneFromGltf } from '@/engines/scene/gltfDocument'
import { modelNode } from '@/engines/scene/nodeFactory'
import { EMPTY_SCENE, type SceneState } from '@/engines/scene/sceneState'

/** A filed module is JSON; the shipped character is a GLB whose magic is not. */
export function sceneFromModuleFile(bytes: Uint8Array, assetId: string): SceneState {
  if (glbChunksOf(bytes)) {
    return { ...EMPTY_SCENE, nodes: [modelNode(assetId, 'Character')] }
  }

  const document: unknown = JSON.parse(new TextDecoder().decode(bytes))
  return { ...EMPTY_SCENE, nodes: sceneFromGltf(document).nodes }
}
