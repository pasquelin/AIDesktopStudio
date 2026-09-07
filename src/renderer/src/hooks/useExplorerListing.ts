import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FOLDER_ROOT, parentOf } from '@shared/domain/folder'
import { entriesSorted, FOLDER_SORTS } from '@/helpers/folderSort'
import { isDomainHeading, type ExplorerNode } from '@/helpers/domainNodes'
import { foldTreeBranch } from '@/helpers/treeExpansion'
import { useDomainTree } from '@/hooks/useDomainTree'
import { useFolderSearch } from '@/hooks/useFolderSearch'
import { useFolderTree, type FolderNode } from '@/hooks/useFolderTree'
import { useLatest } from '@/hooks/useLatest'
import { explorerSearch, useExplorerView } from '@/stores/explorerView'
import { useProject } from '@/stores/project'
import { selectedFilePaths, useSelection } from '@/stores/selection'
import { useTreeFolds } from '@/stores/treeFolds'
import {
  FOLDER_WALK_START,
  walkedTo,
  walkInto,
  type FolderWalk,
} from '@/features/explorer/components/Explorer/folderWalk'
import type { useExplorerEntryPresentation } from './useExplorerEntryPresentation'

type Presentation = ReturnType<typeof useExplorerEntryPresentation>

export function useExplorerListing(documentOf: Presentation['documentOf']) {
  const { t, i18n } = useTranslation()
  const projectPath = useProject(state => state.project?.path ?? null)
  const collection = useExplorerView(state => state.collection)
  const setCollection = useExplorerView(state => state.setExplorerCollection)
  const hidden = useExplorerView(state => state.hidden)
  const term = useExplorerView(explorerSearch)
  const reading = useExplorerView(state => state.mode)
  const tree = useFolderTree(hidden)
  const search = useFolderSearch(term, hidden)
  const searching = term !== ''
  const inDomain = readsDomain(searching, reading)
  const domains = useDomainTree(hidden, inDomain, collection.sort, i18n.language)
  const source = useMemo(() => {
    if (inDomain) return domains
    const selected = searching ? search : tree
    return {
      ...selected,
      nodes: entriesSorted(selected.nodes, collection.sort, i18n.language),
    }
  }, [collection.sort, domains, i18n.language, inDomain, search, searching, tree])
  const { nodes, expandedIds, toggle, reload } = source
  const selectedIds = useSelection(selectedFilePaths)
  const nodeById = useMemo(() => new Map(nodes.map(node => [node.id, node])), [nodes])
  const withChildren = useMemo(() => {
    const parents = new Set<string>()
    for (const node of nodes) if (node.parentId !== null) parents.add(node.parentId)
    return parents
  }, [nodes])
  const expandable = useCallback(
    (node: ExplorerNode): boolean =>
      isDomainHeading(node) ||
      (node.kind === 'folder' && !documentOf(node) && (!searching || withChildren.has(node.id))),
    [documentOf, searching, withChildren],
  )
  const expandableIds = useMemo(
    () => new Set(nodes.filter(expandable).map(node => node.id)),
    [expandable, nodes],
  )
  const anyExpanded = [...expandableIds].some(id => expandedIds.has(id))
  const foldOrder = useTreeFolds(state => state.explorer)
  const initialFoldStamp = useRef(foldOrder.stamp)
  const foldTargets = useLatest({ expandableIds, expandedIds, toggle })
  useEffect(() => useTreeFolds.getState().note('explorer', anyExpanded), [anyExpanded])
  useEffect(() => {
    if (initialFoldStamp.current === foldOrder.stamp) return
    const targets = foldTargets.current
    if (foldOrder.wanted) {
      for (const id of targets.expandableIds) if (!targets.expandedIds.has(id)) targets.toggle(id)
    } else {
      for (const id of targets.expandedIds) targets.toggle(id)
    }
  }, [foldOrder.stamp, foldOrder.wanted, foldTargets])
  const toggleBranch = useCallback(
    (id: string) => {
      if (!expandedIds.has(id)) return toggle(id)
      const kept = foldTreeBranch(nodes, expandedIds, id)
      for (const candidate of expandedIds) if (!kept.has(candidate)) toggle(candidate)
    },
    [expandedIds, nodes, toggle],
  )
  const target = useMemo(() => {
    const node = nodeById.get(selectedIds.at(-1) ?? '')
    if (!node || isDomainHeading(node)) return FOLDER_ROOT
    return node.kind === 'folder' ? node.path : (parentOf(node.path) ?? FOLDER_ROOT)
  }, [nodeById, selectedIds])
  const grid = collection.view === 'grid'
  const browsable = grid && !searching && !inDomain
  const [browsing, setBrowsing] = useState<{ project: string | null; walk: FolderWalk }>({
    project: projectPath,
    walk: FOLDER_WALK_START,
  })
  const walk = browsing.project === projectPath ? browsing.walk : FOLDER_WALK_START
  const asked = walkedTo(walk)
  const standing = standsAt(asked, nodes.length, nodeById, expandedIds)
  const browsed = browsable && standing ? asked : FOLDER_ROOT
  const landing = browsable ? browsed : target
  const goTo = (next: FolderWalk): void => {
    const folder = walkedTo(next)
    useSelection.getState().selectFiles([])
    if (folder !== FOLDER_ROOT && !expandedIds.has(folder)) toggle(folder)
    setBrowsing({ project: projectPath, walk: next })
  }
  const browse = (folder: string): void => goTo(walkInto(walk, folder))
  const entries = useMemo((): readonly FolderNode[] => {
    const files: FolderNode[] = []
    for (const node of nodes) {
      if (isDomainHeading(node)) continue
      if (browsable && node.parentId !== (browsed === FOLDER_ROOT ? null : browsed)) continue
      files.push(node)
    }
    return files
  }, [browsable, browsed, nodes])
  const sorts = useMemo(
    () => FOLDER_SORTS.map(value => ({ value, label: t(`explorer.sort.${value}`) })),
    [t],
  )

  return {
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
    landing,
    nodes,
    projectPath,
    reload,
    search,
    searching,
    selectedIds,
    setCollection,
    sorts,
    toggle,
    toggleBranch,
    walk,
    goTo,
  }
}

function readsDomain(searching: boolean, reading: string): boolean {
  return !searching && reading === 'domain'
}

function standsAt(
  asked: string,
  count: number,
  nodes: ReadonlyMap<string, ExplorerNode>,
  expanded: ReadonlySet<string>,
): boolean {
  return asked === FOLDER_ROOT || count === 0 || (nodes.has(asked) && expanded.has(asked))
}
