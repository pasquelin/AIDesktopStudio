import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from 'react'
import { pickFrom, type Modifiers } from '@/helpers/selection'
import { useRemeasure } from '@/hooks/useRemeasure'
import { useRowHeight } from '@/hooks/useRowHeight'
import { rowDrag } from './rowDrag'
import { TreeView } from './TreeView'
import { focusVirtualCell } from './virtual'
import type { DropTarget, TreeNode, TreeProps, TreeRow } from './treeTypes'
export type { DropTarget, ForeignDrop, TreeNode, TreeProps, TreeRow } from './treeTypes'

export function flattenTree<T extends TreeNode>(
  nodes: readonly T[],
  expandedIds: ReadonlySet<string>,
  expandable?: (node: T) => boolean,
): TreeRow<T>[] {
  const byParent = new Map<string | null, T[]>()
  for (const node of nodes) {
    const siblings = byParent.get(node.parentId)
    if (siblings) siblings.push(node)
    else byParent.set(node.parentId, [node])
  }
  const rows: TreeRow<T>[] = []
  const walk = (parentId: string | null, depth: number): void => {
    const among = byParent.get(parentId) ?? []
    for (const [index, node] of among.entries()) {
      const hasChildren = expandable ? expandable(node) : byParent.has(node.id)
      const expanded = expandedIds.has(node.id)
      rows.push({ node, depth, hasChildren, expanded, position: index + 1, siblings: among.length })
      if (hasChildren && expanded) walk(node.id, depth + 1)
    }
  }
  walk(null, 0)
  return rows
}

function ancestorMatches(
  id: string | null,
  parents: ReadonlyMap<string, string | null>,
  matches: (id: string) => boolean,
): boolean {
  let current = id
  for (let step = 0; current !== null && step <= parents.size; step += 1) {
    if (matches(current)) return true
    current = parents.get(current) ?? null
  }
  return false
}

export function Tree<T extends TreeNode>(props: TreeProps<T>) {
  const {
    nodes,
    selectedIds,
    expandedIds,
    selectable,
    expandable,
    draggable,
    onDrop,
    onInsert,
    onToggle,
  } = props
  const [over, setOver] = useState<{ id: string; target: DropTarget } | null>(null)
  const [dragged, setDragged] = useState<readonly T[] | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const reducing = useRef<string | null>(null)
  const rows = useMemo(
    () => flattenTree(nodes, expandedIds, expandable),
    [nodes, expandedIds, expandable],
  )
  const rowById = useMemo(() => new Map(rows.map((row, at) => [row.node.id, { row, at }])), [rows])
  const parents = useMemo(() => new Map(nodes.map(node => [node.id, node.parentId])), [nodes])
  const selected = useMemo(() => new Set(selectedIds), [selectedIds])
  const leading = dragged?.[0] ?? null
  const restingIn = over?.target.zone === 'into' ? over.id : null
  useEffect(() => {
    if (restingIn === null) return
    const row = rowById.get(restingIn)?.row
    if (!row?.hasChildren || row.expanded) return
    const timer = setTimeout(() => onToggle(restingIn), 600)
    return () => clearTimeout(timer)
  }, [onToggle, restingIn, rowById])

  const gap = useMemo(() => {
    if (leading === null || over === null || over.target.zone === 'into') return null
    const found = rowById.get(over.id)
    if (!found) return null
    let index = found.at
    if (over.target.zone === 'after') {
      index += 1
      while (index < rows.length && (rows[index]?.depth ?? 0) > found.row.depth) index += 1
    }
    return { index, depth: found.row.depth }
  }, [leading, over, rowById, rows])
  const slots = useMemo(() => {
    const placed: (TreeRow<T> | null)[] = [...rows]
    if (gap) placed.splice(gap.index, 0, null)
    return placed
  }, [gap, rows])
  const rowPixels = useRowHeight('control')
  const virtualizer = useVirtualizer({
    count: slots.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => rowPixels,
    overscan: 8,
  })
  useRemeasure(virtualizer, rowPixels)
  const anchor = selectedIds.at(-1)
  const tabStop = Math.max(
    0,
    slots.findIndex(slot => slot?.node.id === anchor),
  )
  const canDrag = (node: T): boolean =>
    (onDrop !== undefined || onInsert !== undefined) &&
    (selectable?.(node) ?? true) &&
    (draggable?.(node) ?? true)
  const under = (ancestorId: string, id: string | null): boolean =>
    ancestorMatches(id, parents, one => one === ancestorId)
  const accepts = (node: T): boolean =>
    dragged !== null &&
    dragged.every(one => !under(one.id, node.id)) &&
    (props.droppable?.(node, dragged) ?? true)
  const batchFrom = (node: T): readonly T[] => {
    if (!props.dragMultiple || !selected.has(node.id)) return [node]
    const chosen = rows.map(row => row.node).filter(one => selected.has(one.id) && canDrag(one))
    const picked = new Set(chosen.map(one => one.id))
    return chosen.filter(one => !ancestorMatches(one.parentId, parents, id => picked.has(id)))
  }
  const insertionAt = (row: TreeRow<T>, side: 'before' | 'after') => {
    if (!dragged || dragged.some(one => under(one.id, row.node.parentId))) return null
    const at = side === 'before' ? row.position - 1 : row.position
    const parentId = row.node.parentId
    const places = dragged
      .filter(one => one.parentId === parentId)
      .map(one => (rowById.get(one.id)?.row.position ?? 0) - 1)
    const index = at - places.filter(place => place < at).length
    const settled =
      places.length === dragged.length && places.every((place, step) => place === index + step)
    return settled ? null : { parentId, index }
  }
  const dropTargetFor = (row: TreeRow<T>, event: DragEvent<HTMLElement>): DropTarget | null => {
    const into = onDrop !== undefined && accepts(row.node)
    if (
      onInsert === undefined ||
      !(selectable?.(row.node) ?? true) ||
      !(props.insertable?.(row.node) ?? true)
    )
      return into ? { zone: 'into' } : null
    const box = event.currentTarget.getBoundingClientRect()
    const ratio = (event.clientY - box.top) / box.height
    const edge = into ? 1 / 3 : 1 / 2
    const side = ratio < edge ? 'before' : ratio >= 1 - edge ? 'after' : null
    if (side === null) return into ? { zone: 'into' } : null
    const insertion = insertionAt(row, side)
    return insertion ? { zone: side, ...insertion } : null
  }
  const release = (event: DragEvent<HTMLElement>): void => {
    const aim = over
    setOver(null)
    setDragged(null)
    const carried = rowDrag.idsFrom(event)
    const row = rows.find(one => one.node.id === aim?.id)
    if (!leading || !aim || !row || carried[0] !== leading.id) return
    if (aim.target.zone === 'into') {
      if (accepts(row.node)) onDrop?.(carried, row.node.id)
      return
    }
    const insertion = insertionAt(row, aim.target.zone)
    if (insertion) onInsert?.(carried, insertion.parentId, insertion.index)
  }
  const pick = (node: T, modifiers: Modifiers): void => {
    if (selectable && !selectable(node)) return props.onSelect([], 'replace')
    const reachable = rows.map(row => row.node).filter(candidate => selectable?.(candidate) ?? true)
    const answer = pickFrom(
      reachable.map(candidate => candidate.id),
      anchor,
      node.id,
      modifiers,
    )
    props.onSelect(answer.ids, answer.mode)
  }
  const onRowKeyDown = (
    row: TreeRow<T>,
    index: number,
    event: KeyboardEvent<HTMLElement>,
  ): void => {
    const focus = (next: number): void =>
      focusVirtualCell(next, {
        scroller: scroller.current,
        scrollToIndex: at => virtualizer.scrollToIndex(at),
        count: slots.length,
        attribute: 'data-row',
      })
    if (event.key === 'ArrowRight' && row.hasChildren && !row.expanded) props.onToggle(row.node.id)
    else if (event.key === 'ArrowLeft' && row.expanded) props.onToggle(row.node.id)
    else if (event.key === 'ArrowDown') focus(Math.min(index + 1, slots.length - 1))
    else if (event.key === 'ArrowUp') focus(Math.max(index - 1, 0))
    else if ((event.key === 'Enter' || event.key === ' ') && event.target === event.currentTarget) {
      if (event.key === 'Enter' && props.onActivate) props.onActivate(row.node)
      else pick(row.node, event)
    } else return
    event.preventDefault()
  }
  return (
    <TreeView
      state={{
        ...props,
        scroller,
        reducing,
        over,
        setOver,
        dragged,
        setDragged,
        slots,
        gap,
        virtualizer,
        selected,
        tabStop,
        canDrag,
        batchFrom,
        release,
        dropTargetFor,
        pick,
        onRowKeyDown,
      }}
    />
  )
}
