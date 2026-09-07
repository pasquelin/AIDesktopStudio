import { gltfDocumentOf } from '@/engines/scene/gltfDocument'
import type { SceneNode } from '@/engines/scene/sceneState'
import type { SceneDocumentState } from './sceneDocumentCodecMessage'

/**
 * The file a scene worker writes, from the halves the protocol carried separately.
 *
 * Lives outside the worker so a test can hold it against `scenePayloadOf`: a worker module runs on
 * import and cannot be called from a suite.
 */
export function sceneDocumentText(
  state: SceneDocumentState,
  nodes: readonly SceneNode[],
  documentId: string,
): string {
  return JSON.stringify(gltfDocumentOf({ ...state, nodes }, { documentId, documentKind: 'scene' }))
}
