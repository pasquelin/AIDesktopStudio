import type { VirtualItem, Virtualizer } from '@tanstack/react-virtual'
import type {
  Dispatch,
  DragEvent,
  KeyboardEvent,
  ReactNode,
  RefObject,
  SetStateAction,
} from 'react'
import type { Modifiers } from '@/helpers/selection'
import type { DropTone } from '@/helpers/drag'
import type { DropTarget, TreeNode, TreeProps, TreeRow } from './treeTypes'

export type TreeOver = { id: string; target: DropTarget; tone?: DropTone } | null

export type TreeViewState<T extends TreeNode> = {
  label: string
  scroller: RefObject<HTMLDivElement | null>
  reducing: RefObject<string | null>
  over: TreeOver
  setOver: Dispatch<SetStateAction<TreeOver>>
  dragged: readonly T[] | null
  setDragged: Dispatch<SetStateAction<readonly T[] | null>>
  slots: readonly (TreeRow<T> | null)[]
  gap: { index: number; depth: number } | null
  virtualizer: Virtualizer<HTMLDivElement, Element>
  selected: ReadonlySet<string>
  tabStop: number
  canDrag: (node: T) => boolean
  batchFrom: (node: T) => readonly T[]
  release: (event: DragEvent<HTMLElement>) => void
  dropTargetFor: (row: TreeRow<T>, event: DragEvent<HTMLElement>) => DropTarget | null
  pick: (node: T, modifiers: Modifiers) => void
  onRowKeyDown: (row: TreeRow<T>, index: number, event: KeyboardEvent<HTMLElement>) => void
  onSelect: TreeProps<T>['onSelect']
  onToggle: TreeProps<T>['onToggle']
  onDropRoot?: TreeProps<T>['onDropRoot']
  onContextMenuRoot?: TreeProps<T>['onContextMenuRoot']
  onDragStart?: TreeProps<T>['onDragStart']
  onActivate?: TreeProps<T>['onActivate']
  onContextMenu?: TreeProps<T>['onContextMenu']
  foreign?: TreeProps<T>['foreign']
  renderRow: (row: TreeRow<T>) => ReactNode
  renderTrailing?: TreeProps<T>['renderTrailing']
}

export type TreeVirtualRowProps<T extends TreeNode> = {
  state: TreeViewState<T>
  virtual: VirtualItem
}
