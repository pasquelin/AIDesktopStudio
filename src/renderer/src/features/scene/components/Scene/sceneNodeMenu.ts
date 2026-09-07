import {
  mdiContentCopy,
  mdiCropFree,
  mdiEyeOffOutline,
  mdiEyeOutline,
  mdiFolderPlusOutline,
  mdiContentSaveMoveOutline,
  mdiPlaylistPlus,
  mdiPlaylistRemove,
  mdiRenameOutline,
  mdiSelectionEllipseRemove,
  mdiSwapHorizontal,
  mdiSpeedometer,
  mdiTrashCanOutline,
} from '@mdi/js'
import type { TFunction } from 'i18next'
import type { CommandId } from '@shared/domain/command'
import { canInvertCarve, canNegate } from '@/engines/csg/carve'
import type { SceneNode } from '@/engines/scene/sceneState'
import { commandRow, showContextMenu, type ContextMenuRow } from '@/helpers/contextMenu'

export type SceneNodeMenuProps = {
  /** The node the pointer is over. Already selected by the caller — see below. */
  node: SceneNode
  /** False on a scene whose viewport is not mounted: there is then nothing to move. */
  canFrame: boolean
  /** The window's translator, as every menu of this studio takes it — see `openLayerMenu`. */
  t: TFunction
  /** Where the rows land: `runSceneCommand`, the same door the toolbar and the keyboard use. */
  run: (command: CommandId) => void
  /** The eye of a row, which is not a command of the space — see the row itself. */
  onToggleVisible: () => void
  /**
   * Whether this node already has a line on the animation band. It flips the LABEL of one row,
   * never the length of the menu — the same shape the eye row takes, and the rule above.
   */
  onSheet: boolean
  /** Files a player module. Absent on every other node, like the two carve rows above. */
  onFileAsModule?: () => void
  /**
   * Opens the name for typing. Absent in the viewport, which draws no name to type over: there
   * the node is renamed from the outliner or from the inspector's own field. The one row that
   * varies, and it varies with the SURFACE rather than with the selection — the rule against a
   * menu of changing length is about the second, which no row here breaks.
   */
  onRename?: () => void
}

/**
 * What can be done with one node of a scene, right-clicked — in the outliner or in the viewport.
 *
 * Every row but two is a `CommandId` rather than a command: they are the very ones the toolbar,
 * the keyboard and the native Édition menu already run, and a second copy of "duplicate" would
 * drift from the first the day one of them learns to offset its copies.
 *
 * The rows act on the SELECTION, never on the node alone — framing reads the engine's own, so a
 * menu that deleted one thing and framed another would be unreadable. Selecting the node first is
 * therefore the caller's job, as it is for the asset shelf (`DraggableAsset`): the outliner arms
 * on pointer down, and the viewport has to do it by hand because its right button flies the
 * camera.
 *
 * Copy, cut and paste are deliberately absent — the four keys every editor shares already sit in
 * the native Édition menu, where a hand that lost them looks.
 */
export function openSceneNodeMenu(props: SceneNodeMenuProps): void {
  const { node, canFrame, t, run, onToggleVisible, onSheet, onRename, onFileAsModule } = props
  const command = (id: CommandId, icon: string): ContextMenuRow => commandRow(id, icon, t, run)

  void showContextMenu([
    ...(onFileAsModule
      ? [
          {
            label: t('playerWindow.file'),
            icon: mdiContentSaveMoveOutline,
            tooltip: t('playerWindow.fileHint'),
            onSelect: onFileAsModule,
          },
        ]
      : []),
    ...(onRename
      ? [
          {
            label: t('scene.rename'),
            icon: mdiRenameOutline,
            tooltip: t('scene.renameHint'),
            onSelect: onRename,
          },
        ]
      : []),
    command('scene.duplicate', mdiContentCopy),
    command('scene.group', mdiFolderPlusOutline),
    command('scene.optimizeSelection', mdiSpeedometer),
    // The two of the boolean family a hand reaches for from HERE: marking a tool, and repairing a
    // fold that ran backwards. Greyed rather than hidden, like framing below — the menu keeps its
    // length whatever is under the pointer.
    { ...command('scene.negate', mdiSelectionEllipseRemove), disabled: !canNegate([node]) },
    { ...command('scene.invertCarve', mdiSwapHorizontal), disabled: !canInvertCarve([node]) },
    command(
      onSheet ? 'scene.removeFromSheet' : 'scene.addToSheet',
      onSheet ? mdiPlaylistRemove : mdiPlaylistPlus,
    ),
    { ...command('scene.frame', mdiCropFree), disabled: !canFrame },
    {
      label: node.visible ? t('scene.hide') : t('scene.show'),
      icon: node.visible ? mdiEyeOffOutline : mdiEyeOutline,
      tooltip: node.visible ? t('scene.hideHint') : t('scene.showHint'),
      onSelect: onToggleVisible,
    },
    command('scene.delete', mdiTrashCanOutline),
  ])
}
