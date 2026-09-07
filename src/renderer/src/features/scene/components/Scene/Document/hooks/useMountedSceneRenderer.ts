import { useEffect } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { SceneRenderer } from '@/engines/scene/SceneRenderer'
import type { SceneStats } from '@/engines/scene/sceneStats'
import type { ScreenBox } from '@/engines/scene/marqueeSelection'
import { useModelFiles } from '@/stores/modelFiles'
import { usePlay } from '@/stores/play'
import { forgetSceneEngine, registerSceneEngine } from '@/stores/sceneEngines'

export type RuntimeSetters = {
  stats: Dispatch<SetStateAction<{ scene: SceneStats; selected: SceneStats }>>
  marquee: Dispatch<SetStateAction<ScreenBox | null>>
  navigating: Dispatch<SetStateAction<boolean>>
  flySpeed: Dispatch<SetStateAction<number | null>>
}

export function useMountedSceneRenderer(
  documentId: string,
  hostRef: MutableRefObject<HTMLDivElement | null>,
  engineRef: MutableRefObject<SceneRenderer | null>,
  setLive: Dispatch<SetStateAction<SceneRenderer | null>>,
  setters: RuntimeSetters,
  createRenderer: (documentId: string, setters: RuntimeSetters) => SceneRenderer,
): void {
  useEffect(() => {
    const element = hostRef.current
    if (!element) return
    const renderer = createRenderer(documentId, setters)
    renderer.mount(element)
    engineRef.current = renderer
    setLive(renderer)
    registerSceneEngine(documentId, renderer)
    return () => {
      usePlay.getState().stop(documentId)
      renderer.dispose()
      engineRef.current = null
      setLive(null)
      forgetSceneEngine(documentId)
      useModelFiles.getState().forget(documentId)
    }
  }, [createRenderer, documentId, engineRef, hostRef, setLive, setters])
}
