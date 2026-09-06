import { mdiBone, mdiBoneOff, mdiCamera, mdiCropFree, mdiHexagonOutline } from '@mdi/js'
import type { TFunction } from 'i18next'
import { workshopAssetOf } from '@shared/domain/character'
import { commandDescriptor, type CommandId } from '@shared/domain/command'
import { DISPLAY_MODES } from '@shared/domain/scene'
import { showContextMenu, type ContextMenuAction } from '@/helpers/contextMenu'
import { displayOfPane, sceneViewChromeOf } from '@/stores/sceneViewChrome'
import { MAIN_SCENE_PANE, useSceneViews } from '@/stores/sceneViews'
import { runWorkshopCommand } from './workshopCommands'

export type WorkshopNodeMenuProps = {
  /** The workshop the model stands in — the id every dock addresses this tab by. */
  workshopId: string
  /** The window's translator, as every menu of this studio takes it. */
  t: TFunction
}

function commandRow(id: CommandId, icon: string, t: TFunction, run: (command: CommandId) => void) {
  const descriptor = commandDescriptor(id)
  return {
    label: descriptor ? t(descriptor.titleKey) : id,
    icon,
    tooltip: descriptor ? t(descriptor.helpKey) : id,
    onSelect: () => run(id),
  }
}

/**
 * What a right-click offers on the model of a workshop: the VIEW, never the document. A scene's
 * node menu would offer to delete or duplicate the one node this tab is about.
 */
export function openWorkshopNodeMenu({ workshopId, t }: WorkshopNodeMenuProps): void {
  const view = sceneViewChromeOf(useSceneViews.getState(), workshopId)
  const display = displayOfPane(view.displays, MAIN_SCENE_PANE)
  // A menu row never flies the camera, so the navigation setter has nothing to set.
  const run = (command: CommandId): void =>
    void runWorkshopCommand(command, {
      assetId: workshopAssetOf(workshopId) ?? '',
      workshopId,
      setNavigating: () => {},
      view,
    })

  const modes: ContextMenuAction[] = DISPLAY_MODES.map(mode => ({
    label: t(`sceneDisplay.${mode}`),
    tooltip: t(`sceneDisplay.${mode}Hint`),
    disabled: mode === display,
    onSelect: () => useSceneViews.getState().setDisplay(workshopId, MAIN_SCENE_PANE, mode),
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
