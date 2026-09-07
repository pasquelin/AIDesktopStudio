import type { Key, ReactNode } from 'react'

export type VirtualFieldListProps<T> = {
  items: readonly T[]
  keyOf: (item: T) => Key
  label: string
  renderItem: (item: T) => ReactNode
}
