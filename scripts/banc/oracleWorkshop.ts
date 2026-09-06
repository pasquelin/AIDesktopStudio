import { workshopIdOf } from '@shared/domain/character'
import { activeCharacterAssetId, useDocuments } from '@/stores/documents'
import { sceneViewOf, useSceneViews } from '@/stores/sceneViews'
import type { Run } from './run'

/** How the model tab in front draws its workshop — what its view rows and menu act on. */
export const workshopView = (_run: Run) => {
  const assetId = activeCharacterAssetId(useDocuments.getState())
  return assetId === null ? null : sceneViewOf(useSceneViews.getState(), workshopIdOf(assetId))
}

/** Whether the studio REFUSED that action — what a scenario about a closed door measures. */
export const refusedWith = (run: Run, action: string): boolean =>
  run.called.some(one => one.action === action && one.answer?.startsWith('refused') === true)
