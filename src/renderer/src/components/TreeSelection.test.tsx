import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { dragTransfer } from '@/helpers/drag-fixtures'
import type { SelectionMode } from '@/helpers/selection'
import { Tree } from './Tree'

type Selector = (ids: readonly string[], mode: SelectionMode) => void

function renderTree(
  onSelect: Selector = () => {},
  onToggle = (): void => {},
  selectedIds: readonly string[] = [],
) {
  return render(
    <Tree
      nodes={NODES}
      label="Outline"
      selectedIds={selectedIds}
      expandedIds={new Set(['scene'])}
      onSelect={onSelect}
      onToggle={onToggle}
      renderRow={row => <span>{row.node.id}</span>}
    />,
  )
}

const NODES = [
  { id: 'scene', parentId: null },
  { id: 'a', parentId: 'scene' },
  { id: 'a1', parentId: 'a' },
  { id: 'b', parentId: 'scene' },
]

describe('Tree', () => {
  it('renders one row per visible node', () => {
    renderTree()

    expect(screen.getAllByRole('treeitem')).toHaveLength(3)
  })

  it('reports the clicked node, replacing whatever was selected', async () => {
    const onSelect = vi.fn()
    renderTree(onSelect)

    await userEvent.click(screen.getByText('a'))

    expect(onSelect).toHaveBeenCalledWith(['a'], 'replace')
  })

  /**
   * What a gesture applies to is the selection, and where it LANDS is read off the picked row.
   * With no way to pick nothing, a file browser whose every row is a folder the studio owns
   * cannot aim at the project folder at all.
   */
  it('clears the selection on a press in the blank below the rows', () => {
    const onSelect = vi.fn()
    renderTree(onSelect)

    const blank = screen.getByRole('tree').parentElement
    fireEvent.pointerDown(blank!)

    expect(onSelect).toHaveBeenCalledWith([], 'replace')
  })

  /**
   * The blank already took a DROP aimed at the project folder; it raised no menu, so the one
   * gesture that makes a folder at the root had nowhere to be reached from — a brand new project,
   * whose rows are all folders one may not write into, offered no way to make one at all.
   */
  it('raises the root menu on a right-click in that same blank, having picked nothing', () => {
    const onSelect = vi.fn()
    const onContextMenuRoot = vi.fn()
    render(
      <Tree
        nodes={NODES}
        label="Outline"
        selectedIds={['scene']}
        expandedIds={new Set(['scene'])}
        onSelect={onSelect}
        onToggle={() => {}}
        onContextMenuRoot={onContextMenuRoot}
        renderRow={row => <span>{row.node.id}</span>}
      />,
    )

    fireEvent.contextMenu(screen.getByRole('tree').parentElement!)

    expect(onSelect).toHaveBeenCalledWith([], 'replace')
    expect(onContextMenuRoot).toHaveBeenCalledOnce()
  })

  // A right-click over a ROW is that row's business: answering for it here would raise the menu
  // of the project folder on top of the one the row raises.
  it('leaves a right-click on a row to the row', () => {
    const onContextMenuRoot = vi.fn()
    render(
      <Tree
        nodes={NODES}
        label="Outline"
        selectedIds={[]}
        expandedIds={new Set(['scene'])}
        onSelect={() => {}}
        onToggle={() => {}}
        onContextMenuRoot={onContextMenuRoot}
        renderRow={row => <span>{row.node.id}</span>}
      />,
    )

    fireEvent.contextMenu(screen.getByRole('tree'))

    expect(onContextMenuRoot).not.toHaveBeenCalled()
  })
})

describe('Tree selection gestures', () => {
  it('toggles the clicked node when the command key is held', async () => {
    const onSelect = vi.fn()
    // One session for the whole gesture: the direct API opens a new one per call, and the held
    // modifier would be released before the click that is supposed to read it.
    const user = userEvent.setup()
    renderTree(onSelect, () => {}, ['scene'])

    await user.keyboard('{Meta>}')
    await user.click(screen.getByText('a'))
    await user.keyboard('{/Meta}')

    expect(onSelect).toHaveBeenCalledWith(['a'], 'toggle')
  })

  // The rows on screen are the tree's own order, and that is what "everything between" means.
  it('extends over the rows between the anchor and the shift-clicked one', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    renderTree(onSelect, () => {}, ['scene'])

    await user.keyboard('{Shift>}')
    await user.click(screen.getByText('b'))
    await user.keyboard('{/Shift}')

    expect(onSelect).toHaveBeenCalledWith(['scene', 'a', 'b'], 'replace')
  })

  it('steps over the rows a selection may not hold when it extends', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    render(
      <Tree
        nodes={NODES}
        label="Outline"
        selectedIds={['scene']}
        expandedIds={new Set(['scene'])}
        onSelect={onSelect}
        onToggle={() => {}}
        selectable={node => node.id !== 'a'}
        renderRow={row => <span>{row.node.id}</span>}
      />,
    )

    await user.keyboard('{Shift>}')
    await user.click(screen.getByText('b'))
    await user.keyboard('{/Shift}')

    expect(onSelect).toHaveBeenCalledWith(['scene', 'b'], 'replace')
  })

  it('selects nothing at all when an unselectable row is clicked', async () => {
    const onSelect = vi.fn()
    render(
      <Tree
        nodes={NODES}
        label="Outline"
        selectedIds={['b']}
        expandedIds={new Set(['scene'])}
        onSelect={onSelect}
        onToggle={() => {}}
        selectable={node => node.id !== 'scene'}
        renderRow={row => <span>{row.node.id}</span>}
      />,
    )

    await userEvent.click(screen.getByText('scene'))

    expect(onSelect).toHaveBeenCalledWith([], 'replace')
  })

  it('paints every selected row, not only the anchor', () => {
    renderTree(
      () => {},
      () => {},
      ['scene', 'b'],
    )

    const selected = screen
      .getAllByRole('treeitem')
      .filter(row => row.getAttribute('aria-selected') === 'true')
    expect(selected).toHaveLength(2)
  })

  // A pixel count would hold the same indent in both densities, next to a layer stack whose own
  // step is a gauge. The two steps differ — one gutter there, two here — the reading does not.
  //
  // Carried by the block INSIDE the row rather than by the row itself, and that is the point: a
  // pinned column sits before it and must not walk right with the depth.
  it('indents each level by the density gauge rather than a pixel count', () => {
    renderTree()

    const indented = screen
      .getAllByRole('treeitem')
      .map(row => row.querySelector<HTMLElement>('[data-chevron]')?.parentElement)
    const [root, child] = indented
    // The factor is held too: it is what keeps a comfortable level at the 12 px it always was.
    expect(root?.style.paddingLeft).toContain('var(--sc-indent)')
    expect(child?.style.paddingLeft).toContain('var(--sc-indent)')
    expect(child?.style.paddingLeft).not.toEqual(root?.style.paddingLeft)
  })

  /**
   * The whole reason `renderTrailing` exists: the eyes of an outliner read as one straight column
   * whatever the depth or the length of a name. A control that walked right with the indent would
   * put a nested row's eye past its parent's, and there would be no column left to read.
   *
   * Asked of the OFFSET rather than of the markup: nothing between the pinned column and the row
   * may carry the indent, whatever elements the tree happens to stack in between. `a1` is two
   * levels down, and its `aria-level` is what says so without reading the DOM.
   */
  it('leaves a pinned column out of the indentation, however deep the row', () => {
    render(
      <Tree
        nodes={NODES}
        label="Outline"
        selectedIds={[]}
        expandedIds={new Set(['scene', 'a'])}
        onSelect={() => {}}
        onToggle={() => {}}
        // Marked rather than named: the row's own name is what `getByText` below asks for, and a
        // second element carrying it would make that query ambiguous.
        renderTrailing={() => <span data-pinned />}
        renderRow={row => <span>{row.node.id}</span>}
      />,
    )

    const deepest = screen.getByText('a1').closest('[role="treeitem"]')
    expect(deepest).toHaveAttribute('aria-level', '3')

    // Walk out of the pinned column up to the row: not one step of it may be indented.
    let walked: HTMLElement | null = deepest?.querySelector<HTMLElement>('[data-pinned]') ?? null
    expect(walked).toBeInTheDocument()
    while (walked && walked !== deepest) {
      expect(walked.style.paddingLeft).toBe('')
      walked = walked.parentElement
    }
    expect(walked).toBe(deepest)
  })

  /**
   * And it is the LAST thing in the row, which is the half of the decision that took three passes:
   * pinned on the left it pushed the chevron, the indent and every name of the panel across by its
   * own width. What is on the left of an outliner is the shape of the tree.
   */
  it('pins that column after everything the depth moves, not before it', () => {
    render(
      <Tree
        nodes={NODES}
        label="Outline"
        selectedIds={[]}
        expandedIds={new Set(['scene'])}
        onSelect={() => {}}
        onToggle={() => {}}
        renderTrailing={() => <span data-pinned />}
        renderRow={row => <span>{row.node.id}</span>}
      />,
    )

    const row = screen.getByText('a').closest('[role="treeitem"]')
    const pinned = row?.querySelector('[data-pinned]')
    const name = screen.getByText('a')

    // `DOCUMENT_POSITION_FOLLOWING` — the pinned column comes after the name in document order,
    // which is what puts it at the far end of a `flex` row.
    expect(name.compareDocumentPosition(pinned as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
  })

  /**
   * The reading a tree exists for: a row INSIDE another starts to its right, and stays there
   * whether it can be opened or not.
   *
   * Asked of the offset, because the markup is not what carries it — an attempt to close the fold
   * column on leaves passed a "does this element exist" test with flying colours while putting a
   * child at exactly its parent's x, the indent and the column being 12px each. Two names are
   * compared here rather than one classname looked up, and that is the whole difference.
   */
  it('starts a row inside another to its right, opened or not', () => {
    render(
      <Tree
        nodes={NODES}
        label="Outline"
        selectedIds={[]}
        expandedIds={new Set(['scene', 'a'])}
        onSelect={() => {}}
        onToggle={() => {}}
        renderTrailing={() => <span data-pinned />}
        renderRow={row => <span>{row.node.id}</span>}
      />,
    )

    // Columns are fixed-width and the indent is the only thing that moves, so what precedes a
    // name is the same run of elements at every depth: the padding IS the offset.
    const indentOf = (name: string): string =>
      screen.getByText(name).closest<HTMLElement>('[style*="padding-left"]')?.style.paddingLeft ??
      ''

    // `a1` is a LEAF two levels down, `a` the group holding it, `scene` the root. One step of the
    // gauge each, and the leaf pays it like everything else.
    expect(indentOf('scene')).toContain('* 0')
    expect(indentOf('a')).toContain('* 1')
    expect(indentOf('a1')).toContain('* 2')
  })

  describe('pressing a row that is already picked', () => {
    const renderPicked = (onSelect: (ids: readonly string[], mode: string) => void) => {
      render(
        <Tree
          nodes={NODES}
          label="Outline"
          selectedIds={['a', 'b']}
          expandedIds={new Set(['scene'])}
          onSelect={onSelect}
          onToggle={() => {}}
          onDrop={() => {}}
          renderRow={row => (
            <span>
              {row.node.id}
              {/* Stops its own press and lets the release through, as `VisibilityToggle` and
                  `InlineRename` both do. */}
              <button data-eye onPointerDown={event => event.stopPropagation()} />
            </span>
          )}
        />,
      )
      // scene, a, a1, b
      return screen.getAllByRole('treeitem')
    }

    /**
     * 🛑 The press may be the start of a drag carrying the WHOLE selection, and `pickFrom` reads a
     * plain click as "replace by this one": reducing on the press emptied the batch before the
     * gesture began — a multi-selection that fell to one row the instant the hand pushed down.
     */
    it('leaves the selection whole while the press is still held', () => {
      const onSelect = vi.fn()
      const [, a] = renderPicked(onSelect)

      fireEvent.pointerDown(a!, { button: 0 })

      expect(onSelect).not.toHaveBeenCalled()
    })

    it('reduces to that row once it is let go without dragging', () => {
      const onSelect = vi.fn()
      const [, a] = renderPicked(onSelect)

      fireEvent.pointerDown(a!, { button: 0 })
      fireEvent.pointerUp(a!)

      expect(onSelect).toHaveBeenCalledWith(['a'], 'replace')
    })

    it('owes no reduction once the press has turned into a drag', () => {
      const onSelect = vi.fn()
      const [, a] = renderPicked(onSelect)

      fireEvent.pointerDown(a!, { button: 0 })
      fireEvent.dragStart(a!, { dataTransfer: dragTransfer() })
      fireEvent.pointerUp(a!)

      expect(onSelect).not.toHaveBeenCalled()
    })

    /**
     * 🛑 A control inside the row — the eye, a rename field — stops the press from reaching the
     * row, but not the RELEASE. A reduction still owed from an earlier press was paid by that
     * release: the selection collapsed on the row whose eye was being toggled.
     */
    it('owes nothing to a control that swallowed its own press', () => {
      const onSelect = vi.fn()
      const [, a] = renderPicked(onSelect)
      const eye = a!.querySelector('[data-eye]')!

      // Armed, then let go somewhere the tree never hears about — outside the window.
      fireEvent.pointerDown(a!, { button: 0 })
      // A later click on the eye, whose press the control keeps to itself.
      fireEvent.pointerDown(eye, { button: 0 })
      fireEvent.pointerUp(eye, { button: 0 })

      expect(onSelect).not.toHaveBeenCalled()
    })

    // The debt belongs to the press that made it: another button's release is another gesture,
    // and a right-click was about to raise a menu ON the selection it would have wiped.
    it('is not paid by the release of another button', () => {
      const onSelect = vi.fn()
      const [, a] = renderPicked(onSelect)

      fireEvent.pointerDown(a!, { button: 0 })
      fireEvent.pointerUp(a!, { button: 2 })

      expect(onSelect).not.toHaveBeenCalled()
    })

    // A row the selection does not hold is picked on the PRESS, as it always was: there is no
    // batch to protect, and waiting for the release would make the whole list feel late.
    it('picks a row outside the selection on the press itself', () => {
      const onSelect = vi.fn()
      const [scene] = renderPicked(onSelect)

      fireEvent.pointerDown(scene!, { button: 0 })

      expect(onSelect).toHaveBeenCalledWith(['scene'], 'replace')
    })
  })
})
