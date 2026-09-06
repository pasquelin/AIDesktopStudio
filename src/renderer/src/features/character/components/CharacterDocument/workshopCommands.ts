import type { Dispatch, SetStateAction } from 'react'
import type { CommandId } from '@shared/domain/command'
import { DEFAULT_CAPTURE_QUALITY } from '@shared/domain/sceneCapture'
import type { TransformMode } from '@/engines/scene/gizmoTarget'
import {
  cycleSceneDisplay,
  toggleSceneSkeletons,
} from '@/features/scene/components/sceneViewCommands'
import { captureSceneView } from '@/helpers/captureSceneView'
import type { CommandAnswer } from '@/services/commandBus'
import { useCharacterView } from '@/stores/characterView'
import { sceneEngineOf } from '@/stores/sceneEngines'
import { MAIN_SCENE_PANE } from '@/stores/sceneViews'

/** The tab passes the two it alone holds; a menu row or the bench passes the workshop and nothing else. */
export type WorkshopCommandContext = {
  workshopId: string
  assetId?: string
  setNavigating?: Dispatch<SetStateAction<boolean>>
}

const MODE_OF: Partial<Record<CommandId, TransformMode>> = {
  'scene.select': 'select',
  'scene.translate': 'translate',
  'scene.rotate': 'rotate',
}

/** What moves the VIEW of a workshop, from its id alone — a menu row and the bench reach these. */
function runWorkshopViewCommand(command: CommandId, workshopId: string): CommandAnswer {
  switch (command) {
    case 'scene.display':
      cycleSceneDisplay(workshopId, MAIN_SCENE_PANE)
      return true
    case 'scene.skeletons':
      toggleSceneSkeletons(workshopId)
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

/**
 * The scene's commands this workshop takes: the ones that move the view, never the document.
 * Answers `false` for a command it leaves to someone else — undo belongs to the character scope.
 */
export function runWorkshopCommand(
  command: CommandId,
  { workshopId, assetId, setNavigating }: WorkshopCommandContext,
): CommandAnswer {
  const mode = MODE_OF[command]
  if (mode) {
    if (assetId === undefined) return false
    useCharacterView.getState().setCharacterMode(assetId, mode)
    setNavigating?.(false)
    return true
  }
  if (command === 'scene.navigate') {
    if (!setNavigating) return false
    setNavigating(current => !current)
    return true
  }
  return runWorkshopViewCommand(command, workshopId)
}
