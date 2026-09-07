import type { DragEvent, ReactNode } from 'react'
import type { TFunction } from 'i18next'
import type { Asset } from '@shared/domain/asset'
import { documentExtensionOf, documentStemOf } from '@shared/domain/document'
import { canMoveInto, FOLDER_ROOT, isPrivatePath, parentOf } from '@shared/domain/folder'
import { Collection } from '@/components/Collection/Collection'
import { CollectionBar } from '@/components/CollectionBar/CollectionBar'
import { FolderCrumbs } from '@/components/FolderCrumbs'
import { Tree } from '@/components/Tree'
import { carriesAsset } from '@/helpers/assetDrag'
import { carriesExternalFiles, externalFileDropTone } from '@/services/externalFiles'
import type { DragLike } from '@/helpers/drag'
import { isDomainHeading, type ExplorerNode } from '@/helpers/domainNodes'
import { applySelection } from '@/helpers/selection'
import { startSceneDrag } from '@/helpers/sceneDrag'
import { HINT_TOP } from '@/helpers/tooltip'
import type { FolderNode } from '@/hooks/useFolderTree'
import type { useExplorerEntryPresentation } from '@/hooks/useExplorerEntryPresentation'
import type { useExplorerListing } from '@/hooks/useExplorerListing'
import { useExternalDropFrame } from '@/hooks/useExternalDropFrame'
import { DomainRow } from '../DomainRow'
import { EntryCard } from '../Entry/EntryCard'
import { EntryRow } from '../Entry/EntryRow'
import { FolderNav } from '../FolderNav'
import { ImportProgress } from '../ImportProgress/ImportProgress'
import { RescanBar } from '../RescanBar'
import { ExplorerEmptyState } from './ExplorerEmptyState'
import { canWalkBy, walkedBy } from './folderWalk'

type Listing = ReturnType<typeof useExplorerListing>
type Presentation = ReturnType<typeof useExplorerEntryPresentation>
type ExplorerBodyProps = {
  acceptsAsset: (node: ExplorerNode) => boolean
  activate: (node: FolderNode) => Promise<void>
  carried: readonly string[] | null
  commitRename: (node: FolderNode, asset: Asset | null, name: string) => void
  emptyState: ReactNode
  enter: (node: FolderNode) => void
  landAsset: (event: DragEvent<HTMLElement>, folder: string) => void
  listing: Listing
  moveFiles: (paths: readonly string[], folder: string) => void
  onBlur: () => void
  onFocus: () => void
  pick: (ids: readonly string[]) => void
  presentation: Presentation
  raiseEntryMenu: (node: FolderNode) => void
  raiseRootMenu: (folder: string) => void
  renaming: { nodeId: string; asset: Asset | null } | null
  setCarried: (paths: readonly string[] | null) => void
  t: TFunction
  waiting: ReadonlySet<string>
}

export function ExplorerBody(props: ExplorerBodyProps) {
  const {
    acceptsAsset,
    activate,
    carried,
    commitRename,
    emptyState,
    enter,
    landAsset,
    listing,
    moveFiles,
    onBlur,
    onFocus,
    pick,
    presentation,
    raiseEntryMenu,
    raiseRootMenu,
    renaming,
    setCarried,
    t,
    waiting,
  } = props
  const {
    browsable,
    browse,
    browsed,
    collection,
    domains,
    entries,
    expandedIds,
    expandable,
    grid,
    inDomain,
    nodes,
    search,
    searching,
    selectedIds,
    setCollection,
    sorts,
    toggle,
    toggleBranch,
    walk,
    goTo,
  } = listing
  const { documentOf, hintFor, iconFor, inkFor, isOpen, kindOf, previewFor } = presentation
  const carriesIntoExplorer = (event: DragLike): boolean =>
    carriesAsset(event) || carriesExternalFiles(event)
  const toneIntoExplorer = (event: DragLike) => externalFileDropTone(event) ?? 'accepted'
  const gridDropFrame = useExternalDropFrame(externalFileDropTone)

  return (
    <div className="flex h-full min-h-0 flex-col" onFocus={onFocus} onBlur={onBlur}>
      <CollectionBar
        scId="explorer"
        state={collection}
        onChange={setCollection}
        sorts={sorts}
        leading={
          browsable ? (
            <FolderNav
              canBack={canWalkBy(walk, -1)}
              canForward={canWalkBy(walk, 1)}
              canUp={browsed !== FOLDER_ROOT}
              onBack={() => goTo(walkedBy(walk, -1))}
              onForward={() => goTo(walkedBy(walk, 1))}
              onUp={() => browse(parentOf(browsed) ?? FOLDER_ROOT)}
            />
          ) : undefined
        }
      />
      <RescanBar />
      <ImportProgress />
      <div className="min-h-0 flex-1">
        {grid ? (
          <div {...gridDropFrame}>
            <Collection
              items={entries}
              state={collection}
              label={t('panels.explorer')}
              multiple
              selectedIds={selectedIds}
              onSelect={(_, ids, mode) => pick(applySelection(selectedIds, ids, mode))}
              onActivate={enter}
              onContextMenu={raiseEntryMenu}
              onPressRoot={() => pick([])}
              onDropRoot={paths => {
                setCarried(null)
                moveFiles(paths, browsed)
              }}
              foreign={{
                carries: carriesIntoExplorer,
                onDrop: event => landAsset(event, browsed),
              }}
              onContextMenuRoot={() => raiseRootMenu(browsed)}
              empty={
                browsable && browsed !== FOLDER_ROOT ? (
                  <ExplorerEmptyState
                    searching={searching}
                    searchAnswered={search.answered}
                    inDomain={inDomain}
                    domainsLoaded={domains.loaded}
                    emptyFolder
                  />
                ) : (
                  emptyState
                )
              }
              renderCard={node => (
                <EntryCard
                  name={documentOf(node)?.title ?? node.name}
                  icon={iconFor(node, false)}
                  ink={inkFor(node)}
                  kind={kindOf(node)}
                  preview={previewFor(node)}
                  open={isOpen(node)}
                  waiting={waiting.has(node.path)}
                  dragIds={selectedIds.includes(node.id) ? selectedIds : [node.id]}
                  pickable={!isPrivatePath(node.path)}
                  accepts={
                    node.kind === 'folder' &&
                    carried !== null &&
                    carried.every(path => canMoveInto(path, node.path))
                  }
                  foreign={{
                    accepts: acceptsAsset(node),
                    carries: carriesIntoExplorer,
                    tone: toneIntoExplorer,
                    onDrop: event => landAsset(event, node.path),
                  }}
                  onPickUp={setCarried}
                  onRelease={() => setCarried(null)}
                  onDropInto={paths => moveFiles(paths, node.path)}
                  {...(renaming?.nodeId === node.id
                    ? { onRename: (name: string) => commitRename(node, renaming.asset, name) }
                    : {})}
                />
              )}
            />
          </div>
        ) : nodes.length === 0 ? (
          emptyState
        ) : (
          <Tree
            nodes={nodes}
            label={t('panels.explorer')}
            selectedIds={selectedIds}
            expandedIds={expandedIds}
            onSelect={(ids, mode) => pick(applySelection(selectedIds, ids, mode))}
            onToggle={toggleBranch}
            selectable={node => !isDomainHeading(node)}
            expandable={expandable}
            draggable={node => !isDomainHeading(node) && !isPrivatePath(node.path)}
            dragMultiple
            onDragStart={(node, event) => {
              const document = isDomainHeading(node) ? null : documentOf(node)
              if (document?.kind === 'scene') startSceneDrag(event, document.id)
            }}
            droppable={(node, dragged) =>
              !isDomainHeading(node) &&
              node.kind === 'folder' &&
              dragged.every(item => !isDomainHeading(item) && canMoveInto(item.path, node.path))
            }
            onDrop={moveFiles}
            onDropRoot={paths => moveFiles(paths, FOLDER_ROOT)}
            foreign={{
              carries: carriesIntoExplorer,
              accepts: acceptsAsset,
              tone: toneIntoExplorer,
              onDrop: (event, node) =>
                landAsset(event, node && !isDomainHeading(node) ? node.path : FOLDER_ROOT),
            }}
            onContextMenuRoot={() => raiseRootMenu(FOLDER_ROOT)}
            onActivate={node => void (isDomainHeading(node) ? toggle(node.id) : activate(node))}
            onContextMenu={node => {
              if (!isDomainHeading(node)) raiseEntryMenu(node)
            }}
            renderRow={row => {
              if (isDomainHeading(row.node)) {
                return <DomainRow domain={row.node.domain} count={row.node.count} />
              }
              const node = row.node
              const document = documentOf(node)
              return (
                <EntryRow
                  name={document?.title ?? node.name}
                  extension={
                    document?.title === documentStemOf(node.name)
                      ? documentExtensionOf(node.name)
                      : undefined
                  }
                  icon={iconFor(node, row.expanded)}
                  ink={inkFor(node)}
                  hint={hintFor(node)}
                  preview={previewFor(node)}
                  open={isOpen(node)}
                  waiting={waiting.has(node.path)}
                  {...(renaming?.nodeId === node.id
                    ? { onRename: (name: string) => commitRename(node, renaming.asset, name) }
                    : {})}
                />
              )
            }}
          />
        )}
      </div>
      {browsable && (
        <FolderCrumbs
          folder={browsed}
          onPick={browse}
          labels={{
            nav: t('explorer.crumbs'),
            projectFolder: t('explorer.projectFolder'),
            hint: t('explorer.crumbHint'),
          }}
          tip={HINT_TOP}
          className="border-border border-t"
        />
      )}
    </div>
  )
}
