import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dragTransfer } from '@/helpers/drag-fixtures'
import { Tree } from './Tree'

const NODES = [
  { id: 'scene', parentId: null },
  { id: 'a', parentId: 'scene' },
  { id: 'a1', parentId: 'a' },
  { id: 'b', parentId: 'scene' },
]

describe('Tree, a folder hovered while something is being dragged', () => {
  const HOVER_NODES = [...NODES, { id: 'elsewhere', parentId: null }]

  /** `scene` is open and `a` is not, so both sides of the guard are reachable from one render. */
  const ROW = { scene: 0, a: 1, elsewhere: 3 }

  function renderHoverable(onToggle: (id: string) => void) {
    return render(
      <Tree
        nodes={HOVER_NODES}
        label="Outline"
        selectedIds={[]}
        expandedIds={new Set(['scene'])}
        onSelect={() => {}}
        onToggle={onToggle}
        // Without it no row has an `into` zone at all — see `dropTargetFor`.
        onDrop={() => {}}
        renderRow={row => <span>{row.node.id}</span>}
      />,
    )
  }

  /** `fireEvent` only, and never `userEvent`: its own timers do not survive being faked. */
  function hover(row: HTMLElement, data: DataTransfer): void {
    fireEvent.dragOver(row, { dataTransfer: data })
  }

  function wait(ms: number): void {
    act(() => void vi.advanceTimersByTime(ms))
  }

  beforeEach(() => vi.useFakeTimers())

  afterEach(() => vi.useRealTimers())

  it('opens it once the hover has lasted, and not before', () => {
    const onToggle = vi.fn()
    renderHoverable(onToggle)
    const data = dragTransfer()
    const rows = screen.getAllByRole('treeitem')

    fireEvent.dragStart(rows[ROW.elsewhere]!, { dataTransfer: data })
    hover(rows[ROW.a]!, data)

    wait(599)
    expect(onToggle).not.toHaveBeenCalled()

    wait(1)
    expect(onToggle).toHaveBeenCalledWith('a')
  })

  /**
   * The defect this guards is the one a user cannot recover from: a tree that folds what it had
   * opened moves under a hand still holding something, and the row being aimed at is gone.
   */
  it('leaves one that is already open alone, however long it is hovered', () => {
    const onToggle = vi.fn()
    renderHoverable(onToggle)
    const data = dragTransfer()
    const rows = screen.getAllByRole('treeitem')

    fireEvent.dragStart(rows[ROW.elsewhere]!, { dataTransfer: data })
    hover(rows[ROW.scene]!, data)
    wait(5_000)

    expect(onToggle).not.toHaveBeenCalled()
  })

  it('forgets it when the pointer moves on before the hover has lasted', () => {
    const onToggle = vi.fn()
    renderHoverable(onToggle)
    const data = dragTransfer()
    const rows = screen.getAllByRole('treeitem')

    fireEvent.dragStart(rows[ROW.elsewhere]!, { dataTransfer: data })
    hover(rows[ROW.a]!, data)
    wait(300)
    hover(rows[ROW.scene]!, data)
    wait(600)

    expect(onToggle).not.toHaveBeenCalled()
  })

  /**
   * A timer that survived the drop would open a folder after the gesture had ended — the tree
   * rearranging itself on its own, a beat after the hand had let go.
   */
  it('forgets it on the drop, so nothing opens after the gesture has ended', () => {
    const onToggle = vi.fn()
    renderHoverable(onToggle)
    const data = dragTransfer()
    const rows = screen.getAllByRole('treeitem')

    fireEvent.dragStart(rows[ROW.elsewhere]!, { dataTransfer: data })
    hover(rows[ROW.a]!, data)
    wait(300)
    fireEvent.drop(rows[ROW.a]!, { dataTransfer: data })
    wait(600)

    expect(onToggle).not.toHaveBeenCalled()
  })

  it('forgets it when the drag ends without a drop', () => {
    const onToggle = vi.fn()
    renderHoverable(onToggle)
    const data = dragTransfer()
    const rows = screen.getAllByRole('treeitem')

    fireEvent.dragStart(rows[ROW.elsewhere]!, { dataTransfer: data })
    hover(rows[ROW.a]!, data)
    wait(300)
    fireEvent.dragEnd(rows[ROW.elsewhere]!, { dataTransfer: data })
    wait(600)

    expect(onToggle).not.toHaveBeenCalled()
  })
})
describe('Tree, a drag that did not start in it', () => {
  const FOREIGN = 'application/x-foreign'

  function foreignTransfer(): DataTransfer {
    const data = dragTransfer()
    data.setData(FOREIGN, 'whatever')
    return data
  }

  const carries = (event: { dataTransfer: DataTransfer | null }): boolean =>
    event.dataTransfer?.types.includes(FOREIGN) ?? false

  function renderForeign(
    onDrop: (event: unknown, node: { id: string } | null) => void,
    accepts: (node: { id: string }) => boolean = () => true,
    extra?: { onToggle?: (id: string) => void; tone?: () => 'accepted' | 'refused' | 'neutral' },
  ) {
    return render(
      <Tree
        nodes={NODES}
        label="Outline"
        selectedIds={[]}
        expandedIds={new Set(['scene'])}
        onSelect={() => {}}
        onToggle={extra?.onToggle ?? (() => {})}
        // Present so the tree's OWN gesture is fully wired: what is tested is that the foreign
        // path does not go through it.
        onDrop={() => {}}
        onInsert={() => {}}
        onDropRoot={() => {}}
        foreign={{ carries, accepts, onDrop, ...(extra?.tone ? { tone: extra.tone } : {}) }}
        renderRow={row => <span>{row.node.id}</span>}
      />,
    )
  }

  it('lands it in the row it was released on, nothing having been picked up here', () => {
    const onDrop = vi.fn()
    renderForeign(onDrop)

    fireEvent.drop(screen.getAllByRole('treeitem')[1]!, { dataTransfer: foreignTransfer() })

    expect(onDrop).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: 'a' }))
  })

  it('leaves a row that refuses it alone', () => {
    const onDrop = vi.fn()
    renderForeign(onDrop, node => node.id !== 'a')

    fireEvent.drop(screen.getAllByRole('treeitem')[1]!, { dataTransfer: foreignTransfer() })

    expect(onDrop).not.toHaveBeenCalled()
  })

  it('draws a refused foreign file in danger and still delivers the drop for its alert', () => {
    const onDrop = vi.fn()
    renderForeign(onDrop, undefined, { tone: () => 'refused' })
    const row = screen.getAllByRole('treeitem')[1]!
    const dataTransfer = foreignTransfer()

    fireEvent.dragOver(row, { dataTransfer })

    expect(row.className).toContain('outline-danger')
    expect(dataTransfer.dropEffect).toBe('none')

    fireEvent.drop(row, { dataTransfer })
    expect(onDrop).toHaveBeenCalled()
  })

  it('draws no acceptance while the operating system still hides the file name', () => {
    renderForeign(vi.fn(), undefined, { tone: () => 'neutral' })
    const row = screen.getAllByRole('treeitem')[1]!
    const dataTransfer = foreignTransfer()

    fireEvent.dragOver(row, { dataTransfer })

    expect(row.className).not.toContain('outline-accent')
    expect(row.className).not.toContain('outline-danger')
    // Drawn as nothing, but never FORBIDDEN: `none` stops the browser sending `drop` at all, and
    // the name stays hidden for the whole of every real dragover.
    expect(dataTransfer.dropEffect).toBe('copy')
  })

  it('keeps the blank below the rows droppable while the file name is still hidden', () => {
    renderForeign(vi.fn(), undefined, { tone: () => 'neutral' })
    const blank = screen.getByRole('tree').parentElement!
    const dataTransfer = foreignTransfer()

    fireEvent.dragOver(blank, { dataTransfer })

    expect(dataTransfer.dropEffect).toBe('copy')
    expect(blank.className).not.toContain('outline-2')
  })

  /**
   * `null` for the blank, which every caller reads as "the place this list is showing". The
   * tree's own blank means the same thing, and `onDropRoot` is what says it for the tree's rows.
   */
  it('reads the blank below the rows as no row at all', () => {
    const onDrop = vi.fn()
    renderForeign(onDrop)

    fireEvent.drop(screen.getByRole('tree').parentElement!, { dataTransfer: foreignTransfer() })

    expect(onDrop).toHaveBeenCalledWith(expect.anything(), null)
  })

  /**
   * It lands INSIDE a row and never between two, `onInsert` or no `onInsert`: what it carries is
   * not a row of this tree, so it has no place in an ordering. Read at the very top of the row,
   * where the tree's own drag would insert before it.
   */
  it('never inserts between two rows, whatever part of one it is released on', () => {
    const onDrop = vi.fn()
    const onInsert = vi.fn()
    render(
      <Tree
        nodes={NODES}
        label="Outline"
        selectedIds={[]}
        expandedIds={new Set(['scene'])}
        onSelect={() => {}}
        onToggle={() => {}}
        onDrop={() => {}}
        onInsert={onInsert}
        foreign={{ carries, accepts: () => true, onDrop }}
        renderRow={row => <span>{row.node.id}</span>}
      />,
    )

    const row = screen.getAllByRole('treeitem')[1]!
    fireEvent.drop(row, { dataTransfer: foreignTransfer(), clientY: 0 })

    expect(onInsert).not.toHaveBeenCalled()
    expect(onDrop).toHaveBeenCalled()
  })

  // The half of the gesture the user asked for by name: carrying something two levels down
  // without letting go works the same whichever list the thing came from.
  it('opens a folder it rests on, exactly as the tree’s own drag does', () => {
    vi.useFakeTimers()
    const onToggle = vi.fn()
    renderForeign(() => {}, undefined, { onToggle })

    fireEvent.dragOver(screen.getAllByRole('treeitem')[1]!, { dataTransfer: foreignTransfer() })
    act(() => void vi.advanceTimersByTime(600))

    expect(onToggle).toHaveBeenCalledWith('a')
    vi.useRealTimers()
  })
})
