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

function hoverAt(row: HTMLElement, ratio: number, data: DataTransfer): void {
  row.getBoundingClientRect = () => ({ top: 0, height: 30 }) as DOMRect
  fireEvent.dragOver(row, { dataTransfer: data, clientY: 30 * ratio })
}

function dropAt(row: HTMLElement, ratio: number, data: DataTransfer): void {
  hoverAt(row, ratio, data)
  fireEvent.drop(row, { dataTransfer: data, clientY: 30 * ratio })
}

function renderInsertable(
  onInsert: (ids: readonly string[], parentId: string | null, index: number) => void,
  onDrop = () => {},
) {
  render(
    <Tree
      nodes={NODES}
      label="Outline"
      selectedIds={[]}
      expandedIds={new Set(['scene', 'a'])}
      onSelect={() => {}}
      onToggle={() => {}}
      onDrop={onDrop}
      onInsert={onInsert}
      renderRow={row => <span>{row.node.id}</span>}
    />,
  )
  return screen.getAllByRole('treeitem')
}

const gap = (): HTMLElement | null => document.querySelector('[data-drop-line]')

const slotsDrawn = (): string[] =>
  [...document.querySelectorAll('[data-drop-line], [role="treeitem"]')].map(one =>
    one.hasAttribute('data-drop-line') ? 'gap' : (one.textContent ?? ''),
  )

describe('Tree dropping between rows', () => {
  it('reports the level receiving the row and its place in it', () => {
    const onInsert = vi.fn()
    const [, a, , b] = renderInsertable(onInsert)
    const data = dragTransfer()

    fireEvent.dragStart(b!, { dataTransfer: data })
    dropAt(a!, 0.1, data)

    expect(onInsert).toHaveBeenCalledWith(['b'], 'scene', 0)
  })

  /**
   * The one case every caller would get wrong on its own: a row moving DOWN its own level
   * leaves a hole behind it, so the place it lands in has shifted by one.
   */
  it('counts the target level as it will be once the row has left it', () => {
    const onInsert = vi.fn()
    const [, a, , b] = renderInsertable(onInsert)
    const data = dragTransfer()

    fireEvent.dragStart(a!, { dataTransfer: data })
    dropAt(b!, 0.9, data)

    expect(onInsert).toHaveBeenCalledWith(['a'], 'scene', 1)
  })

  it('takes a row out of the group holding it', () => {
    const onInsert = vi.fn()
    const [, , a1, b] = renderInsertable(onInsert)
    const data = dragTransfer()

    fireEvent.dragStart(a1!, { dataTransfer: data })
    dropAt(b!, 0.9, data)

    expect(onInsert).toHaveBeenCalledWith(['a1'], 'scene', 2)
  })

  it('says nothing when the row would land exactly where it already sits', () => {
    const onInsert = vi.fn()
    const [, a, , b] = renderInsertable(onInsert)
    const data = dragTransfer()

    fireEvent.dragStart(b!, { dataTransfer: data })
    dropAt(a!, 0.9, data)

    expect(onInsert).not.toHaveBeenCalled()
  })

  // The moved subtree would carry its new parent along with it, and every row under it would
  // leave the tree with no way back.
  it('refuses a row dropped inside its own subtree', () => {
    const onInsert = vi.fn()
    const [, a, a1] = renderInsertable(onInsert)
    const data = dragTransfer()

    fireEvent.dragStart(a!, { dataTransfer: data })
    dropAt(a1!, 0.1, data)

    expect(onInsert).not.toHaveBeenCalled()
  })

  it('keeps the middle of a row for the drop that reparents', () => {
    const onInsert = vi.fn()
    const onDrop = vi.fn()
    const [, a, , b] = renderInsertable(onInsert, onDrop)
    const data = dragTransfer()

    fireEvent.dragStart(b!, { dataTransfer: data })
    dropAt(a!, 0.5, data)

    expect(onDrop).toHaveBeenCalledWith(['b'], 'a')
    expect(onInsert).not.toHaveBeenCalled()
  })
})

describe('Tree insertion feedback', () => {
  it('opens the gap where the row would land', () => {
    const [, a, , b] = renderInsertable(() => {})
    const data = dragTransfer()

    fireEvent.dragStart(b!, { dataTransfer: data })
    hoverAt(a!, 0.1, data)

    expect(slotsDrawn()).toEqual(['scene', 'gap', 'a', 'a1', 'b'])
    expect(a!.className).not.toContain('outline-accent')
  })

  /**
   * 🛑 The gap slides UNDER the pointer the moment it opens — it takes the place the pointer
   * was aiming at. A gap that let events through left nobody answering: the browser drew a
   * refusal, and the `dragleave` of the row it had just pushed closed it again, once per
   * `dragover`. That was the layer stack until 2026-08-26.
   */
  it('holds the aim while the pointer rests in the gap it opened', () => {
    const onInsert = vi.fn()
    const [, a, , b] = renderInsertable(onInsert)
    const data = dragTransfer()

    fireEvent.dragStart(b!, { dataTransfer: data })
    hoverAt(a!, 0.1, data)
    // The pointer has not moved; the gap has moved under it. `false` is the event CANCELLED,
    // which is the whole of what tells the browser a drop may land here.
    expect(fireEvent.dragOver(gap()!, { dataTransfer: data })).toBe(false)
    expect(slotsDrawn()).toEqual(['scene', 'gap', 'a', 'a1', 'b'])

    fireEvent.drop(gap()!, { dataTransfer: data })
    expect(onInsert).toHaveBeenCalledWith(['b'], 'scene', 0)
  })

  /** A gap at the depth of the group and one at its parent's are the two answers a hand aims
   * between, and nothing else on screen tells them apart. */
  it('indents the gap to the level that would receive the row', () => {
    const [, , a1, b] = renderInsertable(() => {})
    const data = dragTransfer()

    fireEvent.dragStart(b!, { dataTransfer: data })
    hoverAt(a1!, 0.1, data)

    expect(gap()?.style.marginLeft).toBe('calc(var(--sc-indent) * 2)')
  })

  /**
   * Crossing from one row to the next fires the leave AFTER the enter and BEFORE the
   * `dragover` that says where the pointer now is: clearing on it blanks the target for a
   * frame, on every row the pointer crosses.
   */
  it('keeps the gap when the pointer merely crosses into another row', () => {
    const [, a, , b] = renderInsertable(() => {})
    const data = dragTransfer()

    fireEvent.dragStart(b!, { dataTransfer: data })
    hoverAt(a!, 0.1, data)
    fireEvent.dragLeave(a!, { dataTransfer: data, relatedTarget: b })

    expect(gap()).not.toBeNull()
  })

  it('dims the row the hand is holding rather than taking it out of the list', () => {
    const [, a, , b] = renderInsertable(() => {})
    const data = dragTransfer()

    fireEvent.dragStart(b!, { dataTransfer: data })
    hoverAt(a!, 0.1, data)

    expect(screen.getAllByRole('treeitem')).toHaveLength(4)
    expect(b!.className).toContain('opacity-40')
  })

  /**
   * The leave alone cannot do it: it fires before the `dragover` that says where the pointer
   * now is, so it has to let a crossing pass. A row that REFUSES is then the one place nothing
   * would ever clear — and the line stayed lit on a row the pointer had left.
   */
  it('takes the gap back on a row that refuses the drop', () => {
    const [, a, , b] = renderInsertable(() => {})
    const data = dragTransfer()

    fireEvent.dragStart(b!, { dataTransfer: data })
    hoverAt(a!, 0.1, data)
    // Its own top edge: `b` would land exactly where it already sits, which is no drop at all.
    hoverAt(b!, 0.1, data)

    expect(gap()).toBeNull()
  })

  // The blank below the rows is no row either, and it takes nothing here — `onDropRoot` is
  // absent — so it used to return before clearing what a row had lit.
  it('takes the gap back when the pointer moves onto the blank below the rows', () => {
    const [, a, , b] = renderInsertable(() => {})
    const data = dragTransfer()

    fireEvent.dragStart(b!, { dataTransfer: data })
    hoverAt(a!, 0.1, data)
    fireEvent.dragOver(screen.getByRole('tree').parentElement!, { dataTransfer: data })

    expect(gap()).toBeNull()
  })

  it('takes the gap back when the gesture ends without dropping', () => {
    const [, a, , b] = renderInsertable(() => {})
    const data = dragTransfer()

    fireEvent.dragStart(b!, { dataTransfer: data })
    hoverAt(a!, 0.1, data)
    fireEvent.dragEnd(b!)

    expect(gap()).toBeNull()
  })

  /**
   * A row beside a group belongs below everything the group holds. Opening the gap right under
   * the group's own row would show it landing between the group and its first child — a place
   * the drop never puts it.
   */
  it('opens the gap below the whole subtree when the row lands after a group', () => {
    // `a1` comes out of `a` and lands beside it, at the root.
    const [, a, a1] = renderInsertable(() => {})
    const data = dragTransfer()

    fireEvent.dragStart(a1!, { dataTransfer: data })
    hoverAt(a!, 0.9, data)

    expect(slotsDrawn()).toEqual(['scene', 'a', 'a1', 'gap', 'b'])
  })

  /**
   * 🛑 The hover says WHERE and the drop says WHEN, and between the two the document can move:
   * another window editing it, a ⌘Z arriving while the hand still holds. An index counted on a
   * level that has changed since lands the batch somewhere else, without a word.
   */
  it('works out where the drop lands again, on the rows as they are at the drop', () => {
    const onInsert = vi.fn()
    const tree = (nodes: readonly TreeNode[]) => (
      <Tree
        nodes={nodes}
        label="Outline"
        selectedIds={[]}
        expandedIds={new Set(['scene', 'a'])}
        onSelect={() => {}}
        onToggle={() => {}}
        onInsert={onInsert}
        renderRow={row => <span>{row.node.id}</span>}
      />
    )
    const { rerender } = render(tree(NODES))
    const [, a, , b] = screen.getAllByRole('treeitem')
    const data = dragTransfer()

    fireEvent.dragStart(b!, { dataTransfer: data })
    hoverAt(a!, 0.1, data)

    // A row arrives ahead of `a` while the hand is still holding, so the place `b` was aiming
    // at has moved down by one.
    rerender(tree([NODES[0]!, { id: 'z', parentId: 'scene' }, ...NODES.slice(1)]))
    fireEvent.drop(gap()!, { dataTransfer: data })

    expect(onInsert).toHaveBeenCalledWith(['b'], 'scene', 1)
  })

  it('picks up a row for a tree that only inserts', () => {
    render(
      <Tree
        nodes={NODES}
        label="Outline"
        selectedIds={[]}
        expandedIds={new Set(['scene'])}
        onSelect={() => {}}
        onToggle={() => {}}
        onInsert={() => {}}
        renderRow={row => <span>{row.node.id}</span>}
      />,
    )

    expect(screen.getAllByRole('treeitem')[1]).toHaveAttribute('draggable', 'true')
  })
})
