import { hasRetargetHost, openRetargetForAsset } from '@/character/retargetHosts'
import { mdiClose, mdiCloseBoxMultipleOutline, mdiRenameOutline, mdiTrashCanOutline } from '@mdi/js'
import type { TFunction } from 'i18next'
import { isFiledKind } from '@shared/domain/document'
import { showContextMenu } from '@/helpers/contextMenu'
import { characterAssetOf, useDocuments } from '@/stores/documents'
import { isCharacterRetargetable, useCharacters } from '@/stores/character'
import { reportFailure } from '@/services/diagnostics'
import { closeTab, closeTabAsking } from './closeTab'
import { deleteDocument } from '../../../documentIo'
import { openPanelIds } from '../../dockviewApi'

export type DocumentTabMenuProps = {
  documentId: string
  /** The window's translator, as every menu of this studio takes it — see `openAssetMenu`. */
  t: TFunction
  /** Hands the rename back to the tab, which owns the field — as `openLayerMenu` does its row. */
  onRename: () => void
}

/**
 * What can be done to a tab, right-clicked.
 *
 * Delete is the only way to remove a document from the project: closing a tab has never taken
 * a file with it, and until this menu existed a document written once could not be removed
 * from inside the studio at all.
 *
 * The menu is gone by the time any of these fails, so the journal is where a failure lands.
 */
export function openDocumentTabMenu({ documentId, t, onRename }: DocumentTabMenuProps): void {
  // 🛑 A tab with no file in the project is named and removed in the LIBRARY: a character rigs a
  // model that lives there, so both gestures belong to the shelf and neither would land here.
  const kind = useDocuments.getState().documents[documentId]?.kind
  const character = characterAssetOf(useDocuments.getState(), documentId)
  const filed = kind !== undefined && isFiledKind(kind)
  const rigged = character !== null && isCharacterRetargetable(useCharacters.getState(), character)

  void showContextMenu([
    ...(character
      ? [
          {
            label: t('character.retarget.title'),
            // The refusal is the only thing worth saying: the label is already on the row.
            tooltip: rigged ? t('character.retarget.title') : t('character.retarget.needsSkeleton'),
            // A rig too, and not the host alone: the window restores the stored skeleton, so
            // on a model that has none it opens on a bare mesh with nothing to map.
            disabled: !hasRetargetHost(character) || !rigged,
            onSelect: () => void openRetargetForAsset(character),
          },
        ]
      : []),
    {
      label: t('documents.rename'),
      icon: mdiRenameOutline,
      tooltip: t('documents.renameHint'),
      disabled: !filed,
      onSelect: onRename,
    },
    {
      label: t('documents.close'),
      icon: mdiClose,
      tooltip: t('documents.closeHint'),
      onSelect: () => closeTab(documentId),
    },
    {
      label: t('documents.closeOthers'),
      icon: mdiCloseBoxMultipleOutline,
      tooltip: t('documents.closeOthersHint'),
      disabled: openPanelIds().length < 2,
      onSelect: () =>
        void closeOthers(documentId).catch(error =>
          reportFailure('document.close', documentId, error),
        ),
    },
    {
      label: t('documents.delete'),
      icon: mdiTrashCanOutline,
      tooltip: t('documents.deleteHint'),
      disabled: !filed,
      onSelect: () =>
        void deleteDocument(documentId).catch(error =>
          reportFailure('document.delete', documentId, error),
        ),
    },
  ])
}

/**
 * The other tabs, one after another rather than all at once: each may ask about unsaved work,
 * and three dialogs stacked on top of each other is not a question anyone can answer. A cancel
 * stops the run — the user said no to closing, not to this one tab.
 */
async function closeOthers(keptId: string): Promise<void> {
  for (const id of openPanelIds()) {
    if (id === keptId) continue
    if (!(await closeTabAsking(id))) return
  }
}
