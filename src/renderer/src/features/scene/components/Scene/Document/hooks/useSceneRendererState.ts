import { useEffect } from 'react'
import type { SceneRenderer, TransformMode } from '@/engines/scene/SceneRenderer'
import type { sceneOf } from '@/stores/scenes'
import type { sceneViewChromeOf } from '@/stores/sceneViewChrome'
import { useSceneViews } from '@/stores/sceneViews'

export function useSceneRendererState(
  engine: { current: SceneRenderer | null },
  scene: ReturnType<typeof sceneOf>,
  viewport: Parameters<SceneRenderer['configure']>[0],
  view: ReturnType<typeof sceneViewChromeOf>,
  mode: TransformMode,
  documentId: string,
): void {
  useEffect(() => engine.current?.apply(scene), [engine, scene])
  useEffect(() => engine.current?.configure(viewport), [engine, viewport])
  useEffect(() => engine.current?.setMode(mode), [engine, mode])
  useEffect(() => engine.current?.setSnapping(view.snapping), [engine, view.snapping])
  useEffect(() => engine.current?.setIsolation(view.isolation), [engine, view.isolation])
  useEffect(
    () => engine.current?.setSpace(view.localFrame ? 'local' : 'world'),
    [engine, view.localFrame],
  )
  useEffect(() => {
    engine.current?.setPoseMode(view.poseMode)
    if (!view.poseMode) {
      engine.current?.setPickedBone(null)
      useSceneViews.getState().setPickedBone(documentId, null)
    }
  }, [documentId, engine, view.poseMode])
  useEffect(() => engine.current?.setPickedBone(view.pickedBone), [engine, view.pickedBone])
  useEffect(
    () => engine.current?.setPickedPathPoint(view.pickedPathPoint),
    [engine, view.pickedPathPoint],
  )
  useEffect(() => engine.current?.setProjection(view.projection), [engine, view.projection])
  useEffect(
    () => engine.current?.setDisplayModes(view.displays, view.quadEdges),
    [engine, view.displays, view.quadEdges],
  )
  useEffect(() => engine.current?.setSkeletons(view.skeletons), [engine, view.skeletons])
  useEffect(() => engine.current?.setQuadView(view.quad), [engine, view.quad])
  useEffect(() => engine.current?.setPaneViews(view.panes), [engine, view.panes])
}
