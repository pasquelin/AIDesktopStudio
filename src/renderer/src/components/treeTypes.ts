import type { DragEvent, ReactNode } from 'react'
import type { DragLike, DropTone } from '@/helpers/drag'
import type { SelectionMode } from '@/helpers/selection'

export type TreeNode = { id: string; parentId: string | null }
export type DropTarget =
  { zone: 'into' } | { zone: 'before' | 'after'; parentId: string | null; index: number }
export type ForeignDrop<T> = {
  carries: (event: DragLike) => boolean
  tone?: (event: DragLike) => DropTone
  accepts: (node: T) => boolean
  onDrop: (event: DragEvent<HTMLElement>, node: T | null) => void
}
export type TreeRow<T> = {
  node: T
  depth: number
  hasChildren: boolean
  expanded: boolean
  position: number
  siblings: number
}
export type TreeProps<T extends TreeNode> = {
  nodes: readonly T[]
  label: string
  selectedIds: readonly string[]
  expandedIds: ReadonlySet<string>
  onSelect: (ids: readonly string[], mode: SelectionMode) => void
  onToggle: (id: string) => void
  selectable?: (node: T) => boolean
  expandable?: (node: T) => boolean
  onActivate?: (node: T) => void
  onContextMenu?: (node: T) => void
  onDrop?: (ids: readonly string[], parentId: string) => void
  onInsert?: (ids: readonly string[], parentId: string | null, index: number) => void
  draggable?: (node: T) => boolean
  insertable?: (node: T) => boolean
  dragMultiple?: boolean
  onDropRoot?: (ids: readonly string[]) => void
  foreign?: ForeignDrop<T>
  onContextMenuRoot?: () => void
  onDragStart?: (node: T, event: DragEvent<HTMLElement>) => void
  droppable?: (node: T, dragged: readonly T[]) => boolean
  renderRow: (row: TreeRow<T>) => ReactNode
  renderTrailing?: (row: TreeRow<T>) => ReactNode
}
