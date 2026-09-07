import type { DisplayMode } from '@shared/domain/scene'
import { sceneViewOf, type SceneView, type SceneViewsState } from './sceneViews'

/** How a given view draws. A pane nobody has set draws the way the studio opens: shaded. */
export function displayOfPane(displays: readonly DisplayMode[], pane: number): DisplayMode {
  return displays[pane] ?? 'shaded'
}

/**
 * Everything a viewport document paints, minus the clock. Used with `useShallow` so a playhead
 * write does not rebuild the toolbar host.
 */
export function sceneViewChromeOf(state: SceneViewsState, documentId: string) {
  const view = sceneViewOf(state, documentId)
  return {
    snapping: view.snapping,
    isolation: view.isolation,
    poseMode: view.poseMode,
    sculptMode: view.sculptMode,
    sculptTool: view.sculptTool,
    sculptRadius: view.sculptRadius,
    sculptFalloff: view.sculptFalloff,
    sculptAmount: view.sculptAmount,
    armedWorld: view.armedWorld,
    armedRelief: view.armedRelief,
    pickedBone: view.pickedBone,
    pickedPathPoint: view.pickedPathPoint,
    projection: view.projection,
    localFrame: view.localFrame,
    displays: view.displays,
    quadEdges: view.quadEdges,
    skeletons: view.skeletons,
    quad: view.quad,
    panes: view.panes,
    activePane: view.activePane,
  }
}

export function sceneViewAffectsMontage(previous: SceneView, next: SceneView): boolean {
  return (
    previous.panes !== next.panes ||
    previous.camera !== next.camera ||
    previous.projection !== next.projection ||
    previous.displays !== next.displays ||
    previous.quad !== next.quad ||
    previous.quadEdges !== next.quadEdges ||
    previous.skeletons !== next.skeletons ||
    previous.isolation !== next.isolation
  )
}

export function sceneViewsAffectMontage(previous: SceneViewsState, next: SceneViewsState): boolean {
  if (previous.views === next.views) return false
  const ids = new Set([...Object.keys(previous.views), ...Object.keys(next.views)])
  for (const id of ids) {
    if (sceneViewAffectsMontage(sceneViewOf(previous, id), sceneViewOf(next, id))) return true
  }
  return false
}
