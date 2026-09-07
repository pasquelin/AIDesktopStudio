import type { ReactNode } from 'react'
import type { VirtualItem, Virtualizer } from '@tanstack/react-virtual'
import { cn } from '@/helpers/cn'
import type { Modifiers } from '@/helpers/selection'
import { GAP } from '../virtual'
import { CollectionVirtualCell } from './CollectionVirtualCell'

type CollectionVirtualRowProps<T extends { id: string }> = {
  row: VirtualItem
  items: readonly T[]
  columns: number
  rowPixels: number
  openable: boolean
  grid: boolean
  virtualizer: Virtualizer<HTMLDivElement, Element>
  selected: ReadonlySet<string>
  isDisabled?: (item: T) => boolean
  tabStop: number
  role?: 'option' | 'listitem'
  pick?: (item: T, modifiers: Modifiers) => void
  onOpen?: (item: T) => void
  onActivate?: (item: T) => void
  onContextMenu?: (item: T) => void
  onCellKeyDown: (index: number, event: KeyboardEvent) => void
  expandedId?: string | null
  canOpen?: (item: T) => boolean
  onToggleRow?: (item: T) => void
  renderCard?: (item: T) => ReactNode
  renderRow?: (item: T) => ReactNode
  renderRowDetail?: (item: T) => ReactNode
}

export function CollectionVirtualRow<T extends { id: string }>(
  props: CollectionVirtualRowProps<T>,
) {
  const { row, items, columns, rowPixels, openable, grid, virtualizer } = props
  const slice = items.slice(row.index * columns, (row.index + 1) * columns)
  return (
    <div
      role="presentation"
      data-index={row.index}
      ref={openable ? virtualizer.measureElement : undefined}
      style={{
        transform: `translateY(${row.start}px)`,
        ['--sc-row-height' as string]: `${rowPixels}px`,
        ...(openable ? {} : { height: row.size }),
        ...(grid
          ? { gap: GAP, gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }
          : { paddingBottom: 4 }),
      }}
      className={cn(
        'absolute inset-x-0 top-0 box-border',
        grid ? 'grid items-start' : openable ? 'flex flex-col' : 'flex',
      )}
    >
      {slice.map((item, column) => (
        <CollectionVirtualCell
          key={item.id}
          {...props}
          item={item}
          index={row.index * columns + column}
          total={items.length}
        />
      ))}
    </div>
  )
}
