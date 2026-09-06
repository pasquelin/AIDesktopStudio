import { Fragment } from 'react'
import type { VirtualFieldListProps } from './virtualFieldListTypes'
import { VirtualizedFieldList } from './VirtualizedFieldList'

const VIRTUAL_FIELD_THRESHOLD = 100

/** Keeps large groups of interactive property rows bounded without changing short forms. */
export function VirtualFieldList<T>({ items, keyOf, label, renderItem }: VirtualFieldListProps<T>) {
  if (items.length > VIRTUAL_FIELD_THRESHOLD)
    return (
      <VirtualizedFieldList items={items} keyOf={keyOf} label={label} renderItem={renderItem} />
    )

  return (
    <div role="group" aria-label={label} className="flex flex-col gap-2">
      {items.map(item => (
        <Fragment key={keyOf(item)}>{renderItem(item)}</Fragment>
      ))}
    </div>
  )
}
