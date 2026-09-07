import {
  mdiContentCopy,
  mdiContentCut,
  mdiContentDuplicate,
  mdiContentPaste,
  mdiFileImportOutline,
  mdiFolderOpenOutline,
  mdiFolderPlusOutline,
  mdiInformationOutline,
  mdiOpenInNew,
  mdiRedo,
  mdiRenameOutline,
  mdiTrashCanOutline,
  mdiUndo,
} from '@mdi/js'
import type { TFunction } from 'i18next'
import type { Asset } from '@shared/domain/asset'
import { bindingOf, type BindingOverrides, type CommandId } from '@shared/domain/command'
import type { DocumentDescriptor } from '@shared/domain/document'
import type { FileHistory } from '@shared/domain/fileOp'
import { isPrivatePath } from '@shared/domain/folder'
import { acceleratorOf } from '@shared/domain/shortcut'
import { showContextMenu, type ContextMenuRow } from '@/helpers/contextMenu'
import type { FolderNode } from '@/hooks/useFolderTree'
import { getBridge } from '@/services/bridge'
import { actionablePaths, type AssetAction } from './assetActions'
import { assetMenuGroups } from '../../assetMenu'
export type EntryMenuProps = {
  node: FolderNode
  selection: readonly string[]
  document: DocumentDescriptor | null
  asset: Asset | null
  folder: string
  clipboard: number
  history: FileHistory
  bindings: BindingOverrides
  t: TFunction
  onOpen: () => void
  onRename: () => void
  onAsset: (action: AssetAction) => void
  run: (command: CommandId) => void
}
function commandRows(bindings: BindingOverrides, run: (command: CommandId) => void) {
  return (
    id: CommandId,
    words: {
      label: string
      tooltip: string
      icon: string
      disabled: boolean
    },
  ): ContextMenuRow => {
    const accelerator = acceleratorOf(bindingOf(id, bindings))
    return {
      ...words,
      onSelect: () => run(id),
      ...(accelerator ? { accelerator } : {}),
    }
  }
}
function historyRows(
  row: ReturnType<typeof commandRows>,
  t: TFunction,
  history: FileHistory,
): ContextMenuRow[] {
  return [
    { separator: true },
    row('explorer.undo', {
      label: t('explorer.undo'),
      tooltip: t('explorer.undoHint'),
      icon: mdiUndo,
      disabled: !history.undo,
    }),
    row('explorer.redo', {
      label: t('explorer.redo'),
      tooltip: t('explorer.redoHint'),
      icon: mdiRedo,
      disabled: !history.redo,
    }),
  ]
}
export type RootMenuProps = {
  clipboard: number
  history: FileHistory
  bindings: BindingOverrides
  t: TFunction
  onImport: () => void
  run: (command: CommandId) => void
}
export function openRootMenu({
  clipboard,
  history,
  bindings,
  t,
  onImport,
  run,
}: RootMenuProps): void {
  const row = commandRows(bindings, run)
  void showContextMenu([
    {
      label: t('assets.import'),
      tooltip: t('assets.importHint'),
      icon: mdiFileImportOutline,
      onSelect: onImport,
    },
    { separator: true },
    row('explorer.paste', {
      label: t('explorer.paste'),
      tooltip: t('explorer.pasteHint'),
      icon: mdiContentPaste,
      disabled: clipboard === 0,
    }),
    { separator: true },
    row('explorer.newFolder', {
      label: t('explorer.newFolder'),
      tooltip: t('explorer.newFolderHint'),
      icon: mdiFolderPlusOutline,
      disabled: false,
    }),
    ...historyRows(row, t, history),
  ])
}
function entryIdentityRows({ node, t, onOpen }: EntryMenuProps): ContextMenuRow[] {
  return [
    {
      label: t('explorer.openEntry'),
      icon: mdiOpenInNew,
      tooltip: t('explorer.openEntryHint'),
      onSelect: onOpen,
    },
    {
      label: t('explorer.reveal'),
      icon: mdiFolderOpenOutline,
      tooltip: t('explorer.revealHint'),
      onSelect: () => void getBridge()?.project.revealFile(node.path),
    },
    {
      label: t('explorer.fileInfo'),
      icon: mdiInformationOutline,
      tooltip: t('explorer.fileInfoHint'),
      disabled: node.kind !== 'file',
      onSelect: () => void getBridge()?.fileInfo.open(node.path),
    },
  ]
}

function entryClipboardRows(props: EntryMenuProps, owned: boolean): ContextMenuRow[] {
  const { bindings, run, t, clipboard, folder } = props
  const row = commandRows(bindings, run)
  return [
    row('explorer.cut', {
      label: t('explorer.cut'),
      tooltip: t('explorer.cutHint'),
      icon: mdiContentCut,
      disabled: owned,
    }),
    row('explorer.copy', {
      label: t('explorer.copy'),
      tooltip: t('explorer.copyHint'),
      icon: mdiContentCopy,
      disabled: owned,
    }),
    row('explorer.paste', {
      label: t('explorer.paste'),
      tooltip: t('explorer.pasteHint'),
      icon: mdiContentPaste,
      disabled: clipboard === 0 || isPrivatePath(folder),
    }),
  ]
}

function entryMutationRows(
  props: EntryMenuProps,
  owned: boolean,
  renamable: boolean,
): ContextMenuRow[] {
  const { bindings, run, t, folder, selection, onRename } = props
  const row = commandRows(bindings, run)
  return [
    row('explorer.newFolder', {
      label: t('explorer.newFolder'),
      tooltip: t('explorer.newFolderHint'),
      icon: mdiFolderPlusOutline,
      disabled: isPrivatePath(folder),
    }),
    row('explorer.duplicate', {
      label: t('explorer.duplicate'),
      tooltip: t('explorer.duplicateHint'),
      icon: mdiContentDuplicate,
      disabled: owned,
    }),
    {
      label: t('explorer.rename'),
      icon: mdiRenameOutline,
      tooltip: t('explorer.renameHint'),
      disabled: !renamable,
      onSelect: onRename,
    },
    row('explorer.trash', {
      label: t('explorer.trash'),
      tooltip: t('explorer.trashHint'),
      icon: mdiTrashCanOutline,
      disabled: selection.some(path => isPrivatePath(path, 'shown')),
    }),
  ]
}

export function openEntryMenu(props: EntryMenuProps): void {
  const { node, selection, document, asset, history, bindings, t, onAsset, run } = props
  const renamable = document !== null || asset !== null || !isPrivatePath(node.path)
  const files = actionablePaths(selection).length
  const owned = files < selection.length
  const row = commandRows(bindings, run)
  void showContextMenu([
    ...entryIdentityRows(props),
    { separator: true },
    ...entryClipboardRows(props, owned),
    { separator: true },
    ...entryMutationRows(props, owned, renamable),
    ...assetMenuGroups({ asset, count: files, t, onAsset }),
    ...historyRows(row, t, history),
  ])
}
