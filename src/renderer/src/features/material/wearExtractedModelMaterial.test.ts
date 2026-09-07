import { beforeEach, describe, expect, it } from 'vitest'
import { modelNode } from '@/engines/scene/nodeFactory'
import { EMPTY_SCENE } from '@/engines/scene/sceneState'
import { resetDocumentStoresForTests } from '@/stores/documentStore'
import { sceneOf, useScenes } from '@/stores/scenes'
import { wearExtractedModelMaterial } from './wearExtractedModelMaterial'

describe('wearing an extracted model material', () => {
  beforeEach(resetDocumentStoresForTests)

  it('updates every scene occurrence of the shared model asset', () => {
    for (const documentId of ['scene-1', 'scene-2']) {
      useScenes.getState().replace(documentId, {
        ...EMPTY_SCENE,
        nodes: [modelNode('model-asset', documentId)],
      })
    }

    wearExtractedModelMaterial('model-asset', 0, 'material-document')

    for (const documentId of ['scene-1', 'scene-2']) {
      const node = sceneOf(useScenes.getState(), documentId).nodes[0]
      expect(node?.type === 'model' ? node.model.dress : undefined).toMatchObject({
        kind: 'materials',
        documentIds: ['material-document'],
      })
    }
  })
})
