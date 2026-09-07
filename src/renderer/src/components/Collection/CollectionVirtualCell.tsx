import { Fragment, type ReactNode } from 'react'
import { cn } from '@/helpers/cn'
import type { Modifiers } from '@/helpers/selection'
import { RowChevron } from '../RowChevron'
import { CollectionCell } from './CollectionCell'
type Props<
  T extends {
    id: string
  },
> = {
  item: T
  index: number
  total: number
  rowPixels: number
  openable: boolean
  grid: boolean
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
export function CollectionVirtualCell<
  T extends {
    id: string
  },
>(props: Props<T>) {
  const { item, openable } = props
  const expandable = props.canOpen?.(item) ?? true
  const open = openable && item.id === props.expandedId && expandable
  const cell = virtualItemCell({ ...props, open, expandable })
  if (!openable) return cell
  return (
    <Fragment>
      <div style={{ height: props.rowPixels }} className="flex shrink-0">
        {cell}
      </div>
      {open && <div data-row-detail>{props.renderRowDetail?.(item)}</div>}
    </Fragment>
  )
}
function virtualItemCell<T extends { id: string }>(
  props: Props<T> & { open: boolean; expandable: boolean },
) {
  const { item, index, openable, grid, open, expandable } = props
  return (
    <CollectionCell
      expanded={openable && expandable ? open : undefined}
      index={index}
      selected={props.selected.has(item.id)}
      disabled={props.isDisabled?.(item) === true}
      tabbable={index === props.tabStop}
      className={grid ? 'p-1' : cn('h-full w-full px-1', openable && 'flex items-center')}
      role={props.role}
      position={index + 1}
      total={props.total}
      onSelect={
        props.pick
          ? modifiers => props.pick?.(item, modifiers)
          : props.onOpen && (() => props.onOpen?.(item))
      }
      onActivate={props.onActivate ? () => props.onActivate?.(item) : undefined}
      onContextMenu={props.onContextMenu ? () => props.onContextMenu?.(item) : undefined}
      onArrow={event => props.onCellKeyDown(index, event)}
    >
      {openable && (
        <RowChevron
          expandable={expandable}
          expanded={open}
          onToggle={() => props.onToggleRow?.(item)}
        />
      )}
      {props.renderCard ? props.renderCard(item) : props.renderRow?.(item)}
    </CollectionCell>
  )
}
