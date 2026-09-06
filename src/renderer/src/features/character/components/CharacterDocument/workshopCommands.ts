import type { Dispatch, SetStateAction } from 'react'
import type { CommandId } from '@shared/domain/command'
import { DEFAULT_CAPTURE_QUALITY } from '@shared/domain/sceneCapture'
import { nextDisplayMode } from '@/engines/scene/sceneView'
import type { TransformMode } from '@/engines/scene/gizmoTarget'
import { captureSceneView } from '@/helpers/captureSceneView'
import type { CommandAnswer } from '@/services/commandBus'
import { useCharacterView } from '@/stores/characterView'
import { sceneEngineOf } from '@/stores/sceneEngines'
import { displayOfPane, type sceneViewChromeOf } from '@/stores/sceneViewChrome'
import { MAIN_SCENE_PANE, useSceneViews } from '@/stores/sceneViews'

export type WorkshopCommandContext = {
  assetId: string
  workshopId: string
  setNavigating: Dispatch<SetStateAction<boolean>>
  view: ReturnType<typeof sceneViewChromeOf>
}

const MODE_OF: Partial<Record<CommandId, TransformMode>> = {
  'scene.select': 'select',
  'scene.translate': 'translate',
  'scene.rotate': 'rotate',
}

/**
 * The scene's commands this workshop takes: the ones that move the view, never the document.
 * Answers `false` for a command it leaves to someone else — undo belongs to the character scope.
 */
export function runWorkshopCommand(
  command: CommandId,
  context: WorkshopCommandContext,
): CommandAnswer {
  const { assetId, workshopId, setNavigating, view } = context
  const mode = MODE_OF[command]
  if (mode) {
    useCharacterView.getState().setCharacterMode(assetId, mode)
    setNavigating(false)
    return true
  }

  switch (command) {
    case 'scene.navigate':
      setNavigating(current => !current)
      return true
    case 'scene.display':
      useSceneViews
        .getState()
        .setDisplay(
          workshopId,
          MAIN_SCENE_PANE,
          nextDisplayMode(displayOfPane(view.displays, MAIN_SCENE_PANE)),
        )
      return true
    case 'scene.skeletons':
      useSceneViews.getState().setSkeletons(workshopId, !view.skeletons)
      return true
    case 'scene.frame':
      // The whole model, not a selection: the workshop has none, and `runSceneCommand` would
      // frame the void.
      return sceneEngineOf(workshopId)?.frameContents() ?? false
    case 'scene.capture':
      void captureSceneView(workshopId, DEFAULT_CAPTURE_QUALITY)
      return true
    default:
      return false
  }
}
