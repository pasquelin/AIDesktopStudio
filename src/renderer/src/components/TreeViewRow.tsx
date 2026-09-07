import { cn } from '@/helpers/cn'
import { copiesDropTone, warnsDropTone } from '@/helpers/drag'
import { isTyping } from '@/helpers/typing'
import { rowDrag } from './rowDrag'
import { RowChevron } from './RowChevron'
import { ROW_LINE, rowSkin } from './styles'
import type { TreeNode } from './treeTypes'
import type { TreeVirtualRowProps } from './treeViewTypes'
const INDENT = 'var(--sc-indent)'
const PINNED = 'flex w-(--sc-control-inline) shrink-0 justify-center'
const NO_MODIFIERS = { shiftKey: false, metaKey: false, ctrlKey: false }

function treeDropGap<T extends TreeNode>({ state, virtual }: TreeVirtualRowProps<T>) {
  return (
    <li
      role="presentation"
      aria-hidden="true"
      style={{ transform: `translateY(${virtual.start}px)`, height: virtual.size }}
      className="absolute inset-x-0 top-0 py-px"
      onDragOver={event => {
        if (rowDrag.carries(event)) {
          event.preventDefault()
          event.dataTransfer.dropEffect = 'move'
        }
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
type VisibleTreeRow<T extends TreeNode> = Exclude<
  TreeVirtualRowProps<T>['state']['slots'][number],
  null | undefined
>
function treeRowClass<T extends TreeNode>(
  state: TreeVirtualRowProps<T>['state'],
  row: VisibleTreeRow<T>,
  picked: boolean,
): string {
  return cn(
    ROW_LINE,
    'group cursor-pointer',
    rowSkin(picked, { surface: 'row' }),
    state.over?.id === row.node.id &&
      state.over.target.zone === 'into' &&
      (warnsDropTone(state.over.tone)
        ? 'outline-danger outline -outline-offset-1'
        : state.over.tone === 'neutral'
          ? undefined
          : 'outline-accent outline -outline-offset-1'),
    state.gap !== null && state.dragged?.some(one => one.id === row.node.id) && 'opacity-40',
  )
}
export function TreeViewRow<T extends TreeNode>({ state, virtual }: TreeVirtualRowProps<T>) {
  const { reducing: reducingRef, scroller } = state
  const index = virtual.index
  const row = state.slots[index]
  if (row === undefined) return null
  if (row === null) return treeDropGap({ state, virtual })
  const picked = state.selected.has(row.node.id)
  const startDrag = (event: React.DragEvent<HTMLElement>): void => {
    if (event.target !== event.currentTarget) return event.preventDefault()
    const batch = state.batchFrom(row.node)
    rowDrag.start(
      event,
      batch.map(one => one.id),
    )
    state.onDragStart?.(row.node, event)
    state.setDragged(batch)
    reducingRef.current = null
  }
  return (
    <li
      role="presentation"
      style={{ transform: `translateY(${virtual.start}px)`, height: virtual.size }}
      className="absolute inset-x-0 top-0 py-px"
    >
      <div
        role="treeitem"
        data-row={index}
        tabIndex={index === state.tabStop ? 0 : -1}
        aria-selected={picked}
        data-selected={picked || undefined}
        aria-expanded={row.hasChildren ? row.expanded : undefined}
        aria-level={row.depth + 1}
        aria-posinset={row.position}
        aria-setsize={row.siblings}
        className={treeRowClass(state, row, picked)}
        draggable={state.canDrag(row.node)}
        onDragStart={startDrag}
        onDragOver={event => {
          if (state.foreign?.carries(event)) {
            if (!state.foreign.accepts(row.node)) return
            event.preventDefault()
            const tone = state.foreign.tone?.(event) ?? 'accepted'
            event.dataTransfer.dropEffect = copiesDropTone(tone) ? 'copy' : 'none'
            state.setOver({ id: row.node.id, target: { zone: 'into' }, tone })
            return
          }
          if (!rowDrag.carries(event)) return
          const target = state.dropTargetFor(row, event)
          if (target === null) return state.setOver(null)
          event.preventDefault()
          event.dataTransfer.dropEffect = 'move'
          state.setOver({ id: row.node.id, target })
        }}
        onDragLeave={event => {
          const next = event.relatedTarget
          if (next instanceof Node && scroller.current?.contains(next)) return
          state.setOver(current => (current?.id === row.node.id ? null : current))
        }}
        onDragEnd={() => {
          state.setOver(null)
          state.setDragged(null)
        }}
        onDrop={event => {
          event.preventDefault()
          if (state.foreign?.carries(event)) {
            state.setOver(null)
            if (state.foreign.accepts(row.node)) state.foreign.onDrop(event, row.node)
            return
          }
          state.release(event)
        }}
        onPointerDown={event => {
          if (event.button === 2) return
          if (picked && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
            reducingRef.current = row.node.id
            return
          }
          reducingRef.current = null
          state.pick(row.node, event)
        }}
        onPointerUp={event => {
          if (reducingRef.current !== row.node.id || event.button !== 0) return
          reducingRef.current = null
          state.pick(row.node, NO_MODIFIERS)
        }}
        onDoubleClick={event => !isTyping(event.target) && state.onActivate?.(row.node)}
        onContextMenu={event => {
          if (!state.onContextMenu || isTyping(event.target)) return
          event.preventDefault()
          if (!picked) state.pick(row.node, NO_MODIFIERS)
          state.onContextMenu(row.node)
        }}
        onKeyDown={event => state.onRowKeyDown(row, index, event)}
      >
        <div
          style={{ paddingLeft: `calc(${INDENT} * ${row.depth})` }}
          className="flex h-full min-w-0 flex-1 items-center"
        >
          <RowChevron
            expandable={row.hasChildren}
            expanded={row.expanded}
            onToggle={() => state.onToggle(row.node.id)}
          />
          {state.renderRow(row)}
        </div>
        {state.renderTrailing && <span className={PINNED}>{state.renderTrailing(row)}</span>}
      </div>
    </li>
  )
}
