import { Fragment } from 'react'
import type { VirtualFieldListProps } from './virtualFieldListTypes'
import { VirtualizedFieldList } from './VirtualizedFieldList'

const VIRTUAL_FIELD_THRESHOLD = 100

/** Keeps large groups of interactive property rows bounded without changing short forms. */
export function VirtualFieldList<T>(props: VirtualFieldListProps<T>) {
  // Spread, never retyped one by one: a prop added to the type reached the virtualised half only.
  if (props.items.length > VIRTUAL_FIELD_THRESHOLD) return <VirtualizedFieldList {...props} />

  const { items, keyOf, label, renderItem } = props
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-2">
      {items.map(item => (
        <Fragment key={keyOf(item)}>{renderItem(item)}</Fragment>
      ))}
    </div>
  )
}
