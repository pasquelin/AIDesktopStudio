import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { SelectionMode } from '@/helpers/selection'
import { Tree } from './Tree'

type Selector = (ids: readonly string[], mode: SelectionMode) => void

const NODES = [
  { id: 'scene', parentId: null },
  { id: 'a', parentId: 'scene' },
  { id: 'a1', parentId: 'a' },
  { id: 'b', parentId: 'scene' },
]

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

describe('Tree', () => {
  it('expands with the right arrow and collapses with the left', async () => {
    const onToggle = vi.fn()
    renderTree(() => {}, onToggle)

    const row = screen.getAllByRole('treeitem')[1]
    row?.focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(onToggle).toHaveBeenCalledWith('a')

    const root = screen.getAllByRole('treeitem')[0]
    root?.focus()
    await userEvent.keyboard('{ArrowLeft}')
    expect(onToggle).toHaveBeenCalledWith('scene')
  })

  it('walks the rows with the up and down arrows', async () => {
    renderTree()

    screen.getAllByRole('treeitem')[0]?.focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getAllByRole('treeitem')[1]).toHaveFocus()

    await userEvent.keyboard('{ArrowUp}')
    expect(screen.getAllByRole('treeitem')[0]).toHaveFocus()
  })

  it('stops at the last row rather than wrapping back to the first', async () => {
    renderTree()

    const rows = screen.getAllByRole('treeitem')
    rows.at(-1)?.focus()
    await userEvent.keyboard('{ArrowDown}')

    expect(rows.at(-1)).toHaveFocus()
  })

  it('toggles from the chevron without selecting the row underneath', async () => {
    const onSelect = vi.fn()
    const onToggle = vi.fn()
    renderTree(onSelect, onToggle)

    await userEvent.click(
      screen.getAllByRole('treeitem')[0]?.querySelector('[data-chevron]') as HTMLElement,
    )

    expect(onToggle).toHaveBeenCalledWith('scene')
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('leaves a single row reachable by tab, so a long tree is not a tab trap', () => {
    renderTree()

    const reachable = screen.getAllByRole('treeitem').filter(row => row.tabIndex === 0)
    expect(reachable).toHaveLength(1)
  })

  // A scene of a few hundred nodes is a few thousand elements, reconciled on every click.
  it('renders a window over the rows rather than all of them', () => {
    const many = Array.from({ length: 2000 }, (_, index) => ({
      id: `node_${index}`,
      parentId: null,
    }))
    render(
      <Tree
        nodes={many}
        label="Outline"
        selectedIds={[]}
        expandedIds={new Set()}
        onSelect={() => {}}
        onToggle={() => {}}
        renderRow={row => <span>{row.node.id}</span>}
      />,
    )

    const rendered = screen.getAllByRole('treeitem')
    expect(rendered.length).toBeGreaterThan(0)
    expect(rendered.length).toBeLessThan(200)
  })
})
