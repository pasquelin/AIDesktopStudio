import { useState } from 'react'
import { copiesDropTone, offerBlankDrop, warnsDropTone, type DropTone } from '@/helpers/drag'
import { cn } from '@/helpers/cn'
import type { TreeNode } from './treeTypes'
import { rowDrag } from './rowDrag'
import { TreeViewRow } from './TreeViewRow'
import type { TreeViewState } from './treeViewTypes'

export type TreeViewProps<T extends TreeNode> = { state: TreeViewState<T> }

export function TreeView<T extends TreeNode>({ state }: TreeViewProps<T>) {
  const [foreignTone, setForeignTone] = useState<DropTone | null>(null)
  const {
    scroller,
    reducing: reducingRef,
    onSelect,
    onContextMenuRoot,
    setOver,
    foreign,
    onDropRoot,
    setDragged,
    label,
    virtualizer,
  } = state
  return (
    <div
      ref={scroller}
      className={cn(
        'h-full overflow-auto p-2',
        (foreignTone === 'accepted' || warnsDropTone(foreignTone)) && 'outline-2 -outline-offset-2',
        foreignTone === 'accepted' && 'outline-accent',
        warnsDropTone(foreignTone) && 'outline-danger',
      )}
      onPointerDownCapture={() => {
        reducingRef.current = null
      }}
      onPointerCancelCapture={() => {
        reducingRef.current = null
      }}
      onPointerDown={event => {
        if (event.target === event.currentTarget) onSelect([], 'replace')
      }}
      onContextMenu={event => {
        if (!onContextMenuRoot || event.target !== event.currentTarget) return
        event.preventDefault()
        onSelect([], 'replace')
        onContextMenuRoot()
      }}
      onDragOver={event => {
        if (event.target !== event.currentTarget) {
          setForeignTone(null)
          return
        }
        setOver(null)
        const carries = foreign?.carries(event) ?? false
        const tone = carries ? (foreign?.tone?.(event) ?? 'accepted') : null
        setForeignTone(tone)
        offerBlankDrop(event, {
          copies: copiesDropTone(tone),
          refuses: tone === 'refused',
          moves: onDropRoot !== undefined && rowDrag.carries(event),
        })
      }}
      onDragLeave={event => {
        const next = event.relatedTarget
        if (next instanceof Node && event.currentTarget.contains(next)) return
        setForeignTone(null)
      }}
      onDrop={event => {
        if (event.target !== event.currentTarget) {
          setForeignTone(null)
          return
        }
        setForeignTone(null)
        if (foreign?.carries(event)) {
          event.preventDefault()
          setOver(null)
          foreign.onDrop(event, null)
          return
        }
        if (!onDropRoot) return
        event.preventDefault()
        setOver(null)
        setDragged(null)
        const carried = rowDrag.idsFrom(event)
        if (carried.length > 0) onDropRoot(carried)
      }}
    >
      <ul
        role="tree"
        aria-label={label}
        style={{ height: virtualizer.getTotalSize() }}
        className="relative"
      >
        {virtualizer.getVirtualItems().map(virtual => {
          const row = state.slots[virtual.index]
          const key = row?.node.id ?? 'gap'
          return <TreeViewRow key={key} state={state} virtual={virtual} />
        })}
      </ul>
    </div>
  )
}
