import { mdiGamepadVariantOutline } from '@mdi/js'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { WindowDragBand } from '@/components/WindowDragBand'
import type { RuntimeReport } from '@shared/domain/gameRuntime'
import { EmptyState } from '@/components/EmptyState'
import { SceneRenderer } from '@/engines/scene/SceneRenderer'
import { useConnections } from '@/hooks/useConnections'
import { environmentDressOf } from '@/features/skybox/components/environmentDress'
import {
  extractedModelDress,
  prepareExtractedModelDress,
  wornModelDress,
} from '@/features/material/modelDress'
import { createGameStage } from '@/game/gameStage'
import { assetVersionOf } from '@/stores/assets'
import { useProject } from '@/stores/project'
import { useSettings } from '@/stores/settings'
import { gameViewport } from '../../gameViewport'
import { GameWindowDebug } from './GameWindowDebug'

/**
 * A scene played as a game, alone in a window of its own. It holds an ENGINE of its own — a WebGL
 * context never crosses a window — and replays the scene the studio publishes on `gameChannel`.
 */
export function GameWindow() {
  const { t } = useTranslation()
  const hostRef = useRef<HTMLDivElement>(null)
  const [report, setReport] = useState<RuntimeReport | null>(null)
  const connectProject = useProject(state => state.connect)
  const connectSettings = useSettings(state => state.connect)

  // 🛑 The project, and not just the scene: a model wears the material and the sky of OTHER
  // documents, and the ports that read them walk this window's own stores. Without it a game
  // draws every model in its raw file dress. And the settings: a window of its own opens on the
  // defaults, and a game drawn from them opens on another lens than the editor it left.
  useConnections([connectProject, connectSettings])

  useEffect(() => {
    const element = hostRef.current
    if (!element) return

    const renderer = new SceneRenderer({
      // A game is played, never picked: nothing here selects, transforms or opens a menu.
      onSelect: () => {},
      onTransform: () => {},
      chrome: false,
      assetVersion: assetVersionOf,
      wornDress: wornModelDress,
      defaultModelDress: extractedModelDress,
      prepareModelDress: prepareExtractedModelDress,
      environmentDress: environmentDressOf,
    })
    renderer.mount(element)
    renderer.configure(gameViewport(useSettings.getState().settings.three))
    // Followed, not read once: the settings land after the window opens, and the person may
    // change the lens while the game runs. Compared by identity — the store writes on every read.
    const unfollow = useSettings.subscribe((state, previous) => {
      if (state.settings.three === previous.settings.three) return
      renderer.configure(gameViewport(state.settings.three))
    })

    // 🛑 Aimed ONCE per game: nothing here ever dragged a viewport, so without it the window
    // opens on the engine's default angle — and re-aiming per frame makes the camera chase a
    // walking character's bounding box, so the picture breathes with every step.
    let framed = false

    // The WINDOW, not the host: a game window is all game, and a key pressed anywhere in it is
    // meant for the game — where the studio had to hand over a focusable div beside its panels.
    const stage = createGameStage({
      renderer,
      // The same engine, under the port a state machine writes through — see `SceneAnimate`.
      animate: renderer,
      input: window,
      onReport: one => {
        setReport(one)
        if (one === null) framed = false
        // Answers false while the models are still landing, which is what lets this keep asking.
        else if (!framed) framed = renderer.frameContents()
      },
    })

    return () => {
      unfollow()
      stage.close()
      renderer.dispose()
    }
  }, [])

  return (
    <div className="bg-monitor relative h-full w-full">
      <div ref={hostRef} className="absolute inset-0" />
      {/* 🛑 The window wears NO title bar — see `openGameWindow` — so without this band nothing
          moves it, on any platform. */}
      <WindowDragBand />
      {report === null && (
        <div className="pointer-events-none absolute inset-0">
          <EmptyState icon={mdiGamepadVariantOutline} message={t('game.window.waiting')} />
        </div>
      )}
      {report !== null && <GameWindowDebug report={report} />}
    </div>
  )
}
