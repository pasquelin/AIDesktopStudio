import { workshopIdOf } from '@shared/domain/character'
import { activeCharacterAssetId, useDocuments } from '@/stores/documents'
import { sceneViewOf, useSceneViews } from '@/stores/sceneViews'

/**
 * How the model tab in front draws its workshop — what its view rows and menu act on. Beside
 * `oracle.ts` rather than in it: that file stands at the size ceiling.
 */
export const workshopView = () => {
  const assetId = activeCharacterAssetId(useDocuments.getState())
  return assetId === null ? null : sceneViewOf(useSceneViews.getState(), workshopIdOf(assetId))
}
