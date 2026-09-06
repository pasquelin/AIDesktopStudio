import { mdiBone, mdiBoneOff, mdiCamera, mdiCropFree, mdiHexagonOutline } from '@mdi/js'
import type { TFunction } from 'i18next'
import type { CommandId } from '@shared/domain/command'
import { isDisplayMode } from '@shared/domain/scene'
import { DISPLAY_TOOL_MODES } from '@/features/scene/components/Scene/sceneTools'
import { commandRow, showContextMenu, type ContextMenuAction } from '@/helpers/contextMenu'
import { displayOfPane } from '@/stores/sceneViewChrome'
import { MAIN_SCENE_PANE, sceneViewOf, useSceneViews } from '@/stores/sceneViews'
import { runWorkshopCommand } from './workshopCommands'

export type WorkshopNodeMenuProps = {
  /** The workshop the model stands in — the id every dock addresses this tab by. */
  workshopId: string
  /** The window's translator, as every menu of this studio takes it. */
  t: TFunction
}

/**
 * What a right-click offers on the model of a workshop: the VIEW, never the document. A scene's
 * node menu would offer to delete or duplicate the one node this tab is about.
 */
export function openWorkshopNodeMenu({ workshopId, t }: WorkshopNodeMenuProps): void {
  const view = sceneViewOf(useSceneViews.getState(), workshopId)
  const display = displayOfPane(view.displays, MAIN_SCENE_PANE)
  const run = (command: CommandId): void => void runWorkshopCommand(command, { workshopId })

  const modes: ContextMenuAction[] = DISPLAY_TOOL_MODES.map(mode => ({
    label: t(mode.labelKey),
    tooltip: t(mode.descriptionKey ?? mode.labelKey),
    disabled: mode.id === display,
    onSelect: () => {
      if (isDisplayMode(mode.id))
        useSceneViews.getState().setDisplay(workshopId, MAIN_SCENE_PANE, mode.id)
    },
  }))

  void showContextMenu([
    commandRow('scene.frame', mdiCropFree, t, run),
    {
      label: t(view.skeletons ? 'character.hideBones' : 'character.showBones'),
      icon: view.skeletons ? mdiBoneOff : mdiBone,
      tooltip: t('character.showBonesHint'),
      onSelect: () => run('scene.skeletons'),
    },
    {
      label: t('sceneTools.display'),
      icon: mdiHexagonOutline,
      tooltip: t('sceneTools.displayHint'),
      rows: modes,
    },
    commandRow('scene.capture', mdiCamera, t, run),
  ])
}
