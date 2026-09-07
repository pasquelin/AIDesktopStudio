import type { SceneRenderer, TransformMode } from '@/engines/scene/SceneRenderer'
import type { sceneOf } from '@/stores/scenes'
import type { sceneViewChromeOf } from '@/stores/sceneViewChrome'
import { useSceneDocumentExports } from './useSceneDocumentExports'
import { useSceneRendererResources } from './useSceneRendererResources'
import { useSceneRendererState } from './useSceneRendererState'
import { useSceneReliefState } from './useSceneReliefState'

/** Pushes declarative document/view state into the live imperative renderer. */
export function useSceneEngineSync({
  engine,
  scene,
  viewport,
  view,
  mode,
  documentId,
  active,
}: {
  engine: { current: SceneRenderer | null }
  scene: ReturnType<typeof sceneOf>
  viewport: Parameters<SceneRenderer['configure']>[0]
  view: ReturnType<typeof sceneViewChromeOf>
  mode: TransformMode
  documentId: string
  active: boolean
}) {
  useSceneRendererState(engine, scene, viewport, view, mode, documentId)
  useSceneReliefState(engine, view)
  useSceneRendererResources(engine)
  useSceneDocumentExports(active, documentId)
}
