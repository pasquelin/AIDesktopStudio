import { useEffect } from 'react'
import type { SceneRenderer } from '@/engines/scene/SceneRenderer'
import type { sceneViewChromeOf } from '@/stores/sceneViewChrome'

/**
 * The LIVE engine rather than its ref: this tab mounts its renderer after every other effect, and
 * a view the store already held would otherwise never reach a renderer that came second.
 */
export function useWorkshopViewState(
  engine: SceneRenderer | null,
  view: ReturnType<typeof sceneViewChromeOf>,
): void {
  useEffect(
    () => engine?.setDisplayModes(view.displays, view.quadEdges),
    [engine, view.displays, view.quadEdges],
  )
  useEffect(() => engine?.setSkeletons(view.skeletons), [engine, view.skeletons])
}
