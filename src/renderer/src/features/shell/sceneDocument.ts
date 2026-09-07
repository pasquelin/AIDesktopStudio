import i18next from 'i18next'
import { gltfDocumentOf, sceneFromGltf, sceneHoldsMore } from '@/engines/scene/gltfDocument'
import { installedPathOf } from '@/engines/scene/projectInstalls'
import type { SceneState } from '@/engines/scene/sceneState'
import { mediaLinkOf } from '@/engines/timeline/mediaLink'
import { documentFolder } from './documentFolder'
import { reportNotice } from '@/services/diagnostics'
import { assetsById, useAssets } from '@/stores/assets'

/**
 * A scene on its way to and from its file, which is a glTF one and nothing else.
 *
 * Only the refusal lives here: composing a scene needs no catalogue, unlike a sky or a material,
 * so the two halves are the engine's. What this side holds is what a READ found and a write
 * would destroy — which is per document, and therefore not an engine's business.
 */

/** Scenes that opened holding MORE than this studio composes — meshes, buffers, animations. */
const incomplete = new Set<string>()

export const forgetCarriedScene = (documentId: string): void => {
  incomplete.delete(documentId)
}

/** The sentence a refusal says, or `null`. The sky's says the same thing about a scene. */
export const sceneRefusesToSave = (documentId: string): string | null =>
  incomplete.has(documentId) ? i18next.t('documents.saveRefusedSceneHoldsMore') : null

export function scenePayloadOf(state: SceneState, documentId: string): unknown {
  const folder = documentFolder(documentId)
  return gltfDocumentOf(state, {
    documentId,
    documentKind: 'scene',
    uriOf: assetId => {
      const path = assetsById(useAssets.getState()).get(assetId)?.path ?? installedPathOf(assetId)
      return path ? mediaLinkOf(path, folder) : null
    },
  })
}

export function sceneFromPayloadFile(payload: unknown, documentId: string): SceneState {
  incomplete.delete(documentId)

  const held = sceneHoldsMore(payload)
  if (held.length > 0) {
    incomplete.add(documentId)
    reportNotice('document.load', i18next.t('documents.sceneHoldsMore', { parts: held.join(', ') }))
  }

  return sceneFromGltf(payload)
}
