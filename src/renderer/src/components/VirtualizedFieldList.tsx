import { useVirtualizer } from '@tanstack/react-virtual'
import { useRef } from 'react'
import { useRemeasure } from '@/hooks/useRemeasure'
import { useRowHeight } from '@/hooks/useRowHeight'
import { useVirtualFieldFocus } from '@/hooks/useVirtualFieldFocus'
import { GAP } from './virtual'
import type { VirtualFieldListProps } from './virtualFieldListTypes'

export function VirtualizedFieldList<T>({
  items,
  keyOf,
  label,
  renderItem,
}: VirtualFieldListProps<T>) {
  const scroll = useRef<HTMLDivElement>(null)
  const rowHeight = useRowHeight('control') + GAP
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scroll.current,
    estimateSize: () => rowHeight,
    getItemKey: index => {
      const item = items[index]
      return item === undefined ? index : keyOf(item)
    },
    overscan: 8,
  })
  useRemeasure(virtualizer, rowHeight)
  const virtualItems = virtualizer.getVirtualItems()
  const continueTab = useVirtualFieldFocus(items.length, rowHeight, scroll, virtualItems)

  return (
    <div
      ref={scroll}
      role="group"
      aria-label={label}
      className="virtual-field-list"
      onKeyDown={continueTab}
    >
      <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
        {virtualItems.map(virtual => {
          const item = items[virtual.index]
          if (item === undefined) return null
          return (
            <div
              key={virtual.key}
              data-virtual-field-index={virtual.index}
              className="absolute inset-x-0 top-0 pb-2"
              style={{ height: virtual.size, transform: `translateY(${virtual.start}px)` }}
            >
              {renderItem(item)}
            </div>
          )
        })}
      </div>
    </div>
  )
}
