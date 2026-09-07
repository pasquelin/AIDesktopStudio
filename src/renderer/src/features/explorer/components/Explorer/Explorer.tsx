import { mdiFolderOpenOutline } from '@mdi/js'
import { useCallback, useEffect, useMemo, useState, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { Asset } from '@shared/domain/asset'
import type { CommandId } from '@shared/domain/command'
import { stemOf } from '@shared/domain/fileName'
import type { FileHistory, FileOutcome } from '@shared/domain/fileOp'
import { FOLDER_ROOT, isPrivatePath, nameOf, parentOf } from '@shared/domain/folder'
import { openDocument } from '@/features/shell/components/dockviewApi'
import { assetAt } from '@/helpers/assetAt'
import { landAssetIn } from '@/helpers/assetDrag'
import { isDomainHeading, type ExplorerNode } from '@/helpers/domainNodes'
import { renameAsset, renameDocument } from '@/helpers/rename'
import { openProjectFile } from '@/helpers/openProjectFile'
import {
  carriesExternalFiles,
  externalFileOfferInto,
  offerExternalFiles,
  queueExternalFiles,
} from '@/services/externalFiles'
import type { FolderNode } from '@/hooks/useFolderTree'
import { useShortcuts } from '@/hooks/useShortcuts'
import { useExplorerEntryPresentation } from '@/hooks/useExplorerEntryPresentation'
import { useExplorerListing } from '@/hooks/useExplorerListing'
import { getBridge } from '@/services/bridge'
import type { CommandAnswer } from '@/services/commandBus'
import { reportFailure } from '@/services/diagnostics'
import { currentOverrides } from '@/stores/bindings'
import { useDocuments } from '@/stores/documents'
import { useMedia } from '@/stores/media'
import { fileClipboardCut, useFileClipboard } from '@/stores/fileClipboard'
import { selectedFilePaths, useSelection } from '@/stores/selection'
import { NoProject } from '@/features/shell/components/NoProject'
import { runAssetAction } from './assetActions'
import { runExplorerCommand, settleFileOutcome } from './explorerCommands'
import { openEntryMenu, openRootMenu } from './entryMenu'
import { ExplorerBody } from './ExplorerBody'
import { ExplorerEmptyState } from './ExplorerEmptyState'

const NO_HISTORY: FileHistory = { undo: false, redo: false }

export function Explorer() {
  const { t } = useTranslation()
  const presentation = useExplorerEntryPresentation()
  const { documentOf } = presentation
  const listing = useExplorerListing(documentOf)
  const { browse, domains, inDomain, landing, projectPath, reload, search, searching, toggle } =
    listing
  const clipboard = useFileClipboard(state => state.paths)
  const cut = useFileClipboard(fileClipboardCut)
  const folderName = t('explorer.newFolderName')
  const [focused, setFocused] = useState(false)
  const [history, setHistory] = useState<FileHistory>(NO_HISTORY)
  const [renaming, setRenaming] = useState<{ nodeId: string; asset: Asset | null } | null>(null)
  const [carried, setCarried] = useState<readonly string[] | null>(null)
  const waiting = useMemo(() => new Set(cut), [cut])

  useEffect(() => {
    void useDocuments.getState().relist()
  }, [projectPath])

  const readHistory = useCallback(
    async (): Promise<FileHistory> => (await getBridge()?.project.fileHistory()) ?? NO_HISTORY,
    [],
  )

  const settled = useCallback(
    (outcome: FileOutcome): void => {
      reload()
      void refreshExplorerHistory(readHistory, setHistory)
      settleFileOutcome(outcome)
    },
    [reload, readHistory],
  )

  useEffect(() => {
    const stop = getBridge()?.project.onFilesChanged(settled)
    return () => stop?.()
  }, [settled])

  const acceptsAsset = (node: ExplorerNode): boolean =>
    !isDomainHeading(node) && node.kind === 'folder' && !isPrivatePath(node.path)

  const landAsset = useCallback(
    (event: DragEvent<HTMLElement>, folder: string): void => {
      void landExplorerAsset(event, folder, projectPath, settled)
    },
    [projectPath, settled],
  )

  useEffect(() => {
    void refreshExplorerHistory(readHistory, setHistory)
    useFileClipboard.getState().clear()
  }, [projectPath, readHistory])

  const pick = (ids: readonly string[]): void => {
    useSelection.getState().selectFiles(ids)
  }

  const run = useCallback(
    (command: CommandId, into: string = landing): CommandAnswer =>
      runExplorerCommand(command, {
        into,
        folderName,
        settle: outcome => {
          settled(outcome)
          const created = command === 'explorer.newFolder' ? outcome.done[0]?.to : undefined
          if (created) setRenaming({ nodeId: created, asset: null })
        },
      }),
    [settled, landing, folderName],
  )

  useShortcuts({ scope: 'explorer', enabled: focused, listens: true, onCommand: run })

  const activate = async (node: FolderNode): Promise<void> => {
    const document = documentOf(node)
    if (document) return openDocument(document)

    if (node.kind === 'folder') return toggle(node.id)

    if ((await openProjectFile(node.path)) === 'missing') {
      reportFailure('explorer.open', nameOf(node.path), new Error('not there'))
    }
  }

  if (!projectPath)
    return <NoProject icon={mdiFolderOpenOutline} message={t('explorer.noProject')} />

  const commitRename = (node: FolderNode, asset: Asset | null, name: string): void => {
    setRenaming(null)
    const document = documentOf(node)

    if (document) return renameDocument(document.id, document.title, name)
    if (name === node.name) return
    if (asset) return renameAsset(asset.id, asset.name, stemOf(name))

    void renameExplorerFile(node.path, name, settled)
  }

  const enter = (node: FolderNode): void => {
    if (documentOf(node) || node.kind !== 'folder') return void activate(node)
    browse(node.path)
  }

  const raiseEntryMenu = (node: FolderNode): void => {
    void showExplorerEntryMenu(node)
  }

  const showExplorerEntryMenu = async (node: FolderNode): Promise<void> => {
    const asset = await assetAt(node.path)
    openEntryMenu({
      node,
      selection: selectedFilePaths(useSelection.getState()),
      document: documentOf(node),
      asset,
      folder: node.kind === 'folder' ? node.path : (parentOf(node.path) ?? FOLDER_ROOT),
      clipboard: clipboard.length,
      history,
      bindings: currentOverrides(),
      t,
      onOpen: () => void activate(node),
      onRename: () => setRenaming({ nodeId: node.id, asset }),
      onAsset: action =>
        void runAssetAction(
          action,
          selectedFilePaths(useSelection.getState()),
          t('assets.contactSheetName'),
        ),
      run,
    })
  }

  const raiseRootMenu = (into: string): void => {
    openRootMenu({
      clipboard: clipboard.length,
      history,
      bindings: currentOverrides(),
      t,
      onImport: () => void useMedia.getState().importMedia(),
      run: command => run(command, into),
    })
  }

  const emptyState = (
    <ExplorerEmptyState
      searching={searching}
      searchAnswered={search.answered}
      inDomain={inDomain}
      domainsLoaded={domains.loaded}
    />
  )

  const moveFiles = (paths: readonly string[], folder: string): void => {
    void moveExplorerFiles(paths, folder, settled)
  }

  return (
    <ExplorerBody
      acceptsAsset={acceptsAsset}
      activate={activate}
      carried={carried}
      commitRename={commitRename}
      emptyState={emptyState}
      enter={enter}
      landAsset={landAsset}
      listing={listing}
      moveFiles={moveFiles}
      onBlur={() => setFocused(false)}
      onFocus={() => setFocused(true)}
      pick={pick}
      presentation={presentation}
      raiseEntryMenu={raiseEntryMenu}
      raiseRootMenu={raiseRootMenu}
      renaming={renaming}
      setCarried={setCarried}
      t={t}
      waiting={waiting}
    />
  )
}

async function moveExplorerFiles(
  paths: readonly string[],
  folder: string,
  settled: (outcome: FileOutcome) => void,
): Promise<void> {
  const bridge = getBridge()
  if (bridge) settled(await bridge.project.moveFiles(paths, folder))
}

async function refreshExplorerHistory(
  readHistory: () => Promise<FileHistory>,
  setHistory: (history: FileHistory) => void,
): Promise<void> {
  setHistory(await readHistory())
}

async function landExplorerAsset(
  event: DragEvent<HTMLElement>,
  folder: string,
  projectPath: string | null,
  settled: (outcome: FileOutcome) => void,
): Promise<void> {
  if (carriesExternalFiles(event)) {
    event.preventDefault()
    event.stopPropagation()
    const offer = await offerExternalFiles(event.dataTransfer.files)
    if (offer) queueExternalFiles([externalFileOfferInto(offer, folder, projectPath)])
    return
  }
  const outcome = await landAssetIn(event, folder)
  if (outcome) settled(outcome)
}

async function renameExplorerFile(
  path: string,
  name: string,
  settled: (outcome: FileOutcome) => void,
): Promise<void> {
  const bridge = getBridge()
  if (bridge) settled(await bridge.project.renameFile(path, name))
}
