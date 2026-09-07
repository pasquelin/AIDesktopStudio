import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useMemo, useRef, type DragEvent, type ReactNode } from 'react'
import { offerBlankDrop, type DragLike } from '@/helpers/drag'
import { LIST_ONLY, type CollectionState } from '@/helpers/collectionState'
import { pickFrom, type Modifiers, type SelectionMode } from '@/helpers/selection'
import { useGrid } from '@/hooks/useGrid'
import { useReachEnd } from '@/hooks/useReachEnd'
import { useRemeasure } from '@/hooks/useRemeasure'
import { useRowHeight, type RowHeight } from '@/hooks/useRowHeight'
import { rowDrag } from '../rowDrag'
import { focusVirtualCell, GAP, PREFETCH_ROWS } from '../virtual'
import { CollectionVirtualRow } from './CollectionVirtualRow'
const ROW_GAP = 4
function onBlank(event: { target: EventTarget | null }): boolean {
  if (!(event.target instanceof Element)) return false
  return event.target.closest('[data-cell],[data-row-detail]') === null
}
export type CollectionProps<
  T extends {
    id: string
  },
> = {
  items: readonly T[]
  state?: CollectionState
  renderCard?: (item: T) => ReactNode
  renderRow?: (item: T) => ReactNode
  label: string
  multiple?: boolean
  selectedIds?: readonly string[]
  onSelect?: (item: T, ids: readonly string[], mode: SelectionMode) => void
  onActivate?: (item: T) => void
  onContextMenu?: (item: T) => void
  onOpen?: (item: T) => void
  onReachEnd?: () => void
  onVisible?: (items: readonly T[]) => void
  isDisabled?: (item: T) => boolean
  renderRowDetail?: (item: T) => ReactNode
  expandedId?: string | null
  canOpen?: (item: T) => boolean
  onToggleRow?: (item: T) => void
  empty?: ReactNode
  footer?: ReactNode
  rowHeight?: RowHeight
  onDropRoot?: (ids: readonly string[]) => void
  foreign?: {
    carries: (event: DragLike) => boolean
    onDrop: (event: DragEvent<HTMLElement>) => void
  }
  onContextMenuRoot?: () => void
  onPressRoot?: () => void
}
type CollectionRoles = {
  list?: 'listbox' | 'list'
  cell?: 'option' | 'listitem'
}
function rolesFor(pickable: boolean, openable: boolean): CollectionRoles {
  if (pickable) return { list: 'listbox', cell: 'option' }
  if (openable) return { list: 'list', cell: 'listitem' }
  return {}
}
type GridFitting = ReturnType<typeof useGrid>
function collectionGeometry<T extends { id: string }>(
  items: readonly T[],
  state: CollectionState,
  renderCard: CollectionProps<T>['renderCard'],
  renderRow: CollectionProps<T>['renderRow'],
  renderRowDetail: CollectionProps<T>['renderRowDetail'],
  fitting: GridFitting,
  rowPixels: number,
) {
  const card = renderRow === undefined || state.view === 'grid' ? renderCard : undefined
  const grid = card !== undefined
  const columns = grid ? fitting.columns : 1
  return {
    card,
    grid,
    columns,
    rows: Math.ceil(items.length / columns),
    size: grid ? fitting.columnWidth + GAP : rowPixels + ROW_GAP,
    openable: renderRowDetail !== undefined && !grid,
    overscan: grid ? 2 : 8,
  }
}
function mountedTabStop(anchored: number, first: number, last: number): number {
  return anchored >= first && anchored <= last ? anchored : first
}
export function Collection<
  T extends {
    id: string
  },
>({
  items,
  state = LIST_ONLY,
  label,
  multiple,
  renderCard,
  renderRow,
  selectedIds,
  onSelect,
  onActivate,
  onContextMenu,
  onOpen,
  onReachEnd,
  onVisible,
  isDisabled,
  renderRowDetail,
  expandedId,
  canOpen,
  onToggleRow,
  empty,
  footer,
  rowHeight = 'control',
  onDropRoot,
  foreign,
  onContextMenuRoot,
  onPressRoot,
}: CollectionProps<T>) {
  const scroller = useRef<HTMLDivElement>(null)
  const wantsGrid = renderRow === undefined || state.view === 'grid'
  const fitting = useGrid(scroller, state.thumbnailSize, wantsGrid && renderCard !== undefined)
  const rowPixels = useRowHeight(rowHeight)
  const roles = rolesFor(onSelect !== undefined, onActivate !== undefined || onOpen !== undefined)
  const { card, grid, columns, rows, size, openable, overscan } = collectionGeometry(
    items,
    state,
    renderCard,
    renderRow,
    renderRowDetail,
    fitting,
    rowPixels,
  )
  const virtualizer = useVirtualizer({
    count: rows,
    getScrollElement: () => scroller.current,
    estimateSize: () => size,
    overscan,
  })
  useRemeasure(virtualizer, size)
  const virtualRows = virtualizer.getVirtualItems()
  const lastRow = virtualRows.at(-1)?.index ?? 0
  useReachEnd({ last: lastRow, count: rows, ahead: PREFETCH_ROWS }, onReachEnd)
  const firstVisible = virtualRows[0]?.index ?? 0
  useEffect(() => {
    if (!onVisible) return
    const shown = items.slice(firstVisible * columns, (lastRow + 1) * columns)
    if (shown.length) onVisible(shown)
  }, [onVisible, items, firstVisible, lastRow, columns])
  const selected = useMemo(() => new Set(selectedIds), [selectedIds])
  const anchor = onSelect ? selectedIds?.at(-1) : undefined
  const anchored = useMemo(
    () => (anchor === undefined ? -1 : items.findIndex(item => item.id === anchor)),
    [items, anchor],
  )
  const firstMounted = firstVisible * columns
  const tabStop = mountedTabStop(anchored, firstMounted, (lastRow + 1) * columns - 1)
  const pick = (item: T, modifiers: Modifiers): void => {
    const { ids, mode } = pickFrom(
      items.map(candidate => candidate.id),
      anchor,
      item.id,
      modifiers,
    )
    onSelect?.(item, ids, mode)
  }
  const focusCell = (index: number): void =>
    focusVirtualCell(index, {
      scroller: scroller.current,
      scrollToIndex: row => virtualizer.scrollToIndex(row),
      count: items.length,
      attribute: 'data-cell',
      columns,
    })
  const onCellKeyDown = (index: number, event: KeyboardEvent): void => {
    if (event.key === 'ArrowRight') focusCell(index + 1)
    else if (event.key === 'ArrowLeft') focusCell(index - 1)
    else if (event.key === 'ArrowDown') focusCell(index + columns)
    else if (event.key === 'ArrowUp') focusCell(index - columns)
    else return
    event.preventDefault()
  }
  return (
    <div
      ref={scroller}
      className="h-full overflow-auto p-2"
      onPointerDown={event => {
        if (event.button !== 2 && onBlank(event)) onPressRoot?.()
      }}
      onContextMenu={event => {
        if (!onContextMenuRoot || !onBlank(event)) return
        event.preventDefault()
        onPressRoot?.()
        onContextMenuRoot()
      }}
      onDragOver={event => {
        if (!onBlank(event)) return
        offerBlankDrop(event, {
          copies: foreign?.carries(event) ?? false,
          moves: onDropRoot !== undefined && rowDrag.carries(event),
        })
      }}
      onDrop={event => {
        if (!onBlank(event)) return
        if (foreign?.carries(event)) {
          event.preventDefault()
          return foreign.onDrop(event)
        }
        if (!onDropRoot) return
        event.preventDefault()
        const carried = rowDrag.idsFrom(event)
        if (carried.length > 0) onDropRoot(carried)
      }}
    >
      {items.length === 0 ? (
        empty
      ) : (
        <div
          role={roles.list}
          aria-label={label}
          aria-multiselectable={roles.list === 'listbox' ? multiple === true : undefined}
          style={{ height: virtualizer.getTotalSize() }}
          className="relative"
        >
          {virtualRows.map(row => (
            <CollectionVirtualRow
              key={row.key}
              row={row}
              items={items}
              columns={columns}
              rowPixels={rowPixels}
              openable={openable}
              grid={grid}
              virtualizer={virtualizer}
              selected={selected}
              isDisabled={isDisabled}
              tabStop={tabStop}
              role={roles.cell}
              pick={onSelect ? pick : undefined}
              onOpen={onOpen}
              onActivate={onActivate}
              onContextMenu={onContextMenu}
              onCellKeyDown={onCellKeyDown}
              expandedId={expandedId}
              canOpen={canOpen}
              onToggleRow={onToggleRow}
              renderCard={card}
              renderRow={renderRow}
              renderRowDetail={renderRowDetail}
            />
          ))}
        </div>
      )}
      {footer}
    </div>
  )
}
