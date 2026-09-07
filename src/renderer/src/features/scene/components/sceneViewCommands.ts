import { nextDisplayMode } from '@/engines/scene/sceneView'
import { displayOfPane } from '@/stores/sceneViewChrome'
import { sceneViewOf, useSceneViews } from '@/stores/sceneViews'

/** The scene's view gestures a second surface shares: the model tab drives its workshop through them. */
export function cycleSceneDisplay(documentId: string, pane: number): void {
  const { displays } = sceneViewOf(useSceneViews.getState(), documentId)
  useSceneViews
    .getState()
    .setDisplay(documentId, pane, nextDisplayMode(displayOfPane(displays, pane)))
}

export function toggleSceneSkeletons(documentId: string): void {
  const { skeletons } = sceneViewOf(useSceneViews.getState(), documentId)
  useSceneViews.getState().setSkeletons(documentId, !skeletons)
}
