import { cn } from '@/helpers/cn'
import type { TreeNode } from './Tree'
import { rowDrag } from './rowDrag'
import { ROW_LINE } from './styles'
import type { TreeVirtualRowProps } from './treeViewTypes'

const INDENT = 'var(--sc-indent)'

export function TreeViewGap<T extends TreeNode>({ state, virtual }: TreeVirtualRowProps<T>) {
  return (
    <li
      role="presentation"
      aria-hidden="true"
      style={{ transform: `translateY(${virtual.start}px)`, height: virtual.size }}
      className="absolute inset-x-0 top-0 py-px"
      onDragOver={event => {
        if (!rowDrag.carries(event)) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
      }}
      onDrop={event => {
        event.preventDefault()
        state.release(event)
      }}
    >
      <div
        data-drop-line
        style={{ marginLeft: `calc(${INDENT} * ${state.gap?.depth ?? 0})` }}
        className={cn(ROW_LINE, 'border-accent border-b-2')}
      />
    </li>
  )
}
