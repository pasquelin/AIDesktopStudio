import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { dragTransfer } from '@/helpers/drag-fixtures'
import { Tree, type TreeNode } from './Tree'

const NODES = [
  { id: 'scene', parentId: null },
  { id: 'a', parentId: 'scene' },
  { id: 'a1', parentId: 'a' },
  { id: 'b', parentId: 'scene' },
]

describe('Tree', () => {
  it('tells the caller what is being dragged, so a target can judge the pair', () => {
    const droppable = vi.fn(() => true)
    render(
      <Tree
        nodes={NODES}
        label="Outline"
        selectedIds={[]}
        expandedIds={new Set(['scene'])}
        onSelect={() => {}}
        onToggle={() => {}}
        onDrop={() => {}}
        droppable={droppable}
        renderRow={row => <span>{row.node.id}</span>}
      />,
    )

    const rows = screen.getAllByRole('treeitem')
    const data = dragTransfer()
    fireEvent.dragStart(rows[1]!, { dataTransfer: data })
    fireEvent.dragOver(rows[2]!, { dataTransfer: data })
    fireEvent.drop(rows[2]!, { dataTransfer: data })

    // The batch, always — one row long unless `dragMultiple` says otherwise.
    expect(droppable).toHaveBeenCalledWith({ id: 'b', parentId: 'scene' }, [
      { id: 'a', parentId: 'scene' },
    ])
  })

  describe('dragging several rows at once', () => {
    // `a` holds `a1`; `b` and `c` sit beside `a` at the root.
    const FOUR: TreeNode[] = [...NODES, { id: 'c', parentId: 'scene' }]

    const renderPicked = (
      selectedIds: readonly string[],
      handlers: {
        onDrop?: (ids: readonly string[], parentId: string) => void
        onInsert?: (ids: readonly string[], parentId: string | null, index: number) => void
      },
    ) => {
      render(
        <Tree
          nodes={FOUR}
          label="Outline"
          selectedIds={selectedIds}
          expandedIds={new Set(['scene', 'a'])}
          onSelect={() => {}}
          onToggle={() => {}}
          dragMultiple
          onDrop={handlers.onDrop ?? (() => {})}
          {...(handlers.onInsert ? { onInsert: handlers.onInsert } : {})}
          renderRow={row => <span>{row.node.id}</span>}
        />,
      )
      // scene, a, a1, b, c
      return screen.getAllByRole('treeitem')
    }

    /**
     * `selectedIds` runs in the order of the CLICKS that built it — its last entry is the anchor
     * a range extends from. A batch handed over in that order would land upside down.
     */
    it('carries the selection in the order of the screen, not the order it was picked in', () => {
      const onDrop = vi.fn()
      const [scene, a, , , c] = renderPicked(['c', 'a'], { onDrop })
      const data = dragTransfer()

      fireEvent.dragStart(c!, { dataTransfer: data })
      fireEvent.dragOver(scene!, { dataTransfer: data })
      fireEvent.drop(scene!, { dataTransfer: data })

      expect(onDrop).toHaveBeenCalledWith(['a', 'c'], 'scene')
      expect(a).toBeDefined()
    })

    // The index counts the level once the batch has LEFT it, so each member that sat above the
    // place aimed at shifts it down by one.
    it('counts every member of the batch that leaves the level ahead of the drop', () => {
      const onInsert = vi.fn()
      const [, a, , b] = renderPicked(['a', 'c'], { onInsert })
      const data = dragTransfer()

      fireEvent.dragStart(a!, { dataTransfer: data })
      // The top edge of `b`, which is the second place of the level — `a` leaves it from the
      // first, so the batch lands on the first.
      b!.getBoundingClientRect = () => ({ top: 0, height: 30 }) as DOMRect
      fireEvent.dragOver(b!, { dataTransfer: data, clientY: 3 })
      fireEvent.drop(b!, { dataTransfer: data, clientY: 3 })

      expect(onInsert).toHaveBeenCalledWith(['a', 'c'], 'scene', 0)
    })

    it('says nothing when the whole batch already sits on that very run of places', () => {
      const onInsert = vi.fn()
      const [, a, , b] = renderPicked(['a', 'b'], { onInsert })
      const data = dragTransfer()

      fireEvent.dragStart(a!, { dataTransfer: data })
      // Below `b`, where `a` and `b` already are: the drop would rebuild the level into itself.
      b!.getBoundingClientRect = () => ({ top: 0, height: 30 }) as DOMRect
      fireEvent.dragOver(b!, { dataTransfer: data, clientY: 27 })
      fireEvent.drop(b!, { dataTransfer: data, clientY: 27 })

      expect(onInsert).not.toHaveBeenCalled()
    })

    // It already travels inside the group carrying it, and moving it as well would lift it out.
    it('leaves out a row whose own ancestor is in the batch', () => {
      const onDrop = vi.fn()
      const [scene, a] = renderPicked(['a', 'a1'], { onDrop })
      const data = dragTransfer()

      fireEvent.dragStart(a!, { dataTransfer: data })
      fireEvent.dragOver(scene!, { dataTransfer: data })
      fireEvent.drop(scene!, { dataTransfer: data })

      expect(onDrop).toHaveBeenCalledWith(['a'], 'scene')
    })
  })

  // The drag channel is shared by every tree of the studio, so `carries` alone would let a
  // scene node be dropped into a file browser and reported as one of its own rows.
  it('ignores a drop whose drag began in another tree', () => {
    const onDrop = vi.fn()
    render(
      <Tree
        nodes={NODES}
        label="Outline"
        selectedIds={[]}
        expandedIds={new Set(['scene'])}
        onSelect={() => {}}
        onToggle={() => {}}
        onDrop={onDrop}
        renderRow={row => <span>{row.node.id}</span>}
      />,
    )

    const elsewhere = dragTransfer()
    elsewhere.setData('application/x-ai-desktop-studio-tree-row', 'from-another-tree')
    fireEvent.drop(screen.getAllByRole('treeitem')[2]!, { dataTransfer: elsewhere })

    expect(onDrop).not.toHaveBeenCalled()
  })

  /**
   * A drag cancelled after its source row scrolled out of the window fires no `dragEnd`, so the
   * tree goes on holding the node it picked up. The channel is shared by every tree of the
   * studio, so the next drag started anywhere at all would be reported here as that stale node —
   * moving something the hand never touched.
   */
  it('ignores a drop carrying something other than what it picked up', () => {
    const onDrop = vi.fn()
    render(
      <Tree
        nodes={NODES}
        label="Outline"
        selectedIds={[]}
        expandedIds={new Set(['scene'])}
        onSelect={() => {}}
        onToggle={() => {}}
        onDrop={onDrop}
        renderRow={row => <span>{row.node.id}</span>}
      />,
    )

    const rows = screen.getAllByRole('treeitem')
    fireEvent.dragStart(rows[1]!, { dataTransfer: dragTransfer() })

    const elsewhere = dragTransfer()
    elsewhere.setData('application/x-ai-desktop-studio-tree-row', 'from-another-tree')
    fireEvent.drop(rows[2]!, { dataTransfer: elsewhere })

    expect(onDrop).not.toHaveBeenCalled()
  })
})
