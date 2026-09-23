import { useEffect } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { RenderEngine } from '@shared/domain/renderEngine'
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

/**
 * Mounts the renderer the document asks for, and rebuilds it when that answer changes.
 *
 * 🛑 `engine` is a DEPENDENCY, and it has to be: a whole scene lives inside one graphics context,
 * so a document that opens on the Advanced engine cannot be handed the Compatible renderer that
 * is already up. A tab mounts before its file has landed — `restoreDocument` reads the disk — so
 * such a document comes up Compatible and rebuilds once when its world arrives, at the cost of
 * one graphics context discarded. Every Compatible document, and every new one of either kind,
 * mounts once: a new scene is seeded before its tab opens.
 *
 * 🛑 `null` holds the mount off until the engine asked for can actually be built — see
 * `useRenderEngineReady`, without which the rebuild above lands before the Advanced bundle does
 * and falls back for the rest of the session.
 *
 * 🛑 Waiting for the document STATE instead was tried on 2026-09-11 and put back: a tab whose
 * document never lands would then never draw at all, which is a blank viewport rather than a
 * wasted context.
 */
export function useMountedSceneRenderer(
  documentId: string,
  engine: RenderEngine | null,
  hostRef: MutableRefObject<HTMLDivElement | null>,
  rendererRef: MutableRefObject<SceneRenderer | null>,
  setLive: Dispatch<SetStateAction<SceneRenderer | null>>,
  setters: RuntimeSetters,
  createRenderer: (
    documentId: string,
    setters: RuntimeSetters,
    engine: RenderEngine,
  ) => SceneRenderer,
): void {
  useEffect(() => {
    const element = hostRef.current
    if (!element || engine === null) return
    const renderer = createRenderer(documentId, setters, engine)
    renderer.mount(element)
    rendererRef.current = renderer
    setLive(renderer)
    registerSceneEngine(documentId, renderer)
    return () => {
      usePlay.getState().stop(documentId)
      renderer.dispose()
      rendererRef.current = null
      setLive(null)
      forgetSceneEngine(documentId)
      useModelFiles.getState().forget(documentId)
    }
  }, [createRenderer, documentId, engine, hostRef, rendererRef, setLive, setters])
}
