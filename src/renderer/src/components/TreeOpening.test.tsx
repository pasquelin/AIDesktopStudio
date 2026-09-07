import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import type { SelectionMode } from '@/helpers/selection'
import { flattenTree, Tree } from './Tree'

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

describe('Tree, the menu a right-click opens', () => {
  const withMenu = (renderRow: (row: { node: { id: string } }) => ReactNode) => {
    const onContextMenu = vi.fn()
    render(
      <Tree
        nodes={NODES}
        label="Outline"
        selectedIds={[]}
        expandedIds={new Set(['scene'])}
        onSelect={() => {}}
        onToggle={() => {}}
        onContextMenu={onContextMenu}
        renderRow={renderRow}
      />,
    )
    return onContextMenu
  }

  it('names the node the pointer was over', () => {
    const onContextMenu = withMenu(row => <span>{row.node.id}</span>)

    fireEvent.contextMenu(screen.getByText('a'))

    expect(onContextMenu).toHaveBeenCalledWith(NODES[1])
  })

  /**
   * A row can BE a text field — the explorer renames in place — and the press then belongs to the
   * native clipboard menu, which Chromium never asks the main process for once this row has
   * called `preventDefault` (`main/window/contextMenu.ts`).
   */
  it('leaves a right-click inside a row that is a field to the native menu', () => {
    const onContextMenu = withMenu(row =>
      row.node.id === 'a' ? <input /> : <span>{row.node.id}</span>,
    )

    const raised = fireEvent.contextMenu(screen.getByRole('textbox'))

    expect(raised).toBe(true)
    expect(onContextMenu).not.toHaveBeenCalled()
  })
})
describe('Tree, opening a row', () => {
  const withActivate = (onActivate: (node: { id: string }) => void, onSelect = vi.fn()) =>
    render(
      <Tree
        nodes={NODES}
        label="Outline"
        selectedIds={[]}
        expandedIds={new Set(['scene'])}
        onSelect={onSelect}
        onToggle={() => {}}
        onActivate={onActivate}
        renderRow={row => <span>{row.node.id}</span>}
      />,
    )

  it('opens on a double-click', async () => {
    const onActivate = vi.fn()
    withActivate(onActivate)

    await userEvent.dblClick(screen.getByText('a'))

    expect(onActivate).toHaveBeenCalledWith(NODES[1])
  })

  it('opens on Enter', async () => {
    const onActivate = vi.fn()
    withActivate(onActivate)

    screen.getAllByRole('treeitem')[1]?.focus()
    await userEvent.keyboard('{Enter}')

    expect(onActivate).toHaveBeenCalledWith(NODES[1])
  })

  // A key that opened a document from a browser and selected a node from an outliner would be
  // the same key meaning two things.
  it('still picks on Space', async () => {
    const onActivate = vi.fn()
    const onSelect = vi.fn()
    withActivate(onActivate, onSelect)

    screen.getAllByRole('treeitem')[1]?.focus()
    await userEvent.keyboard(' ')

    expect(onActivate).not.toHaveBeenCalled()
    expect(onSelect).toHaveBeenCalled()
  })

  it('picks on Enter when there is nothing to open', async () => {
    const onSelect = vi.fn()
    renderTree(onSelect)

    screen.getAllByRole('treeitem')[1]?.focus()
    await userEvent.keyboard('{Enter}')

    expect(onSelect).toHaveBeenCalled()
  })
})

describe('Tree, a node that can hold children it has not got yet', () => {
  it('offers to expand what the caller says is expandable', () => {
    render(
      <Tree
        nodes={[{ id: 'assets', parentId: null }]}
        label="Outline"
        selectedIds={[]}
        expandedIds={new Set()}
        onSelect={() => {}}
        onToggle={() => {}}
        expandable={() => true}
        renderRow={row => <span>{row.node.id}</span>}
      />,
    )

    expect(screen.getByRole('treeitem')).toHaveAttribute('aria-expanded', 'false')
  })

  it('leaves a leaf a leaf', () => {
    render(
      <Tree
        nodes={[{ id: 'notes.txt', parentId: null }]}
        label="Outline"
        selectedIds={[]}
        expandedIds={new Set()}
        onSelect={() => {}}
        onToggle={() => {}}
        expandable={() => false}
        renderRow={row => <span>{row.node.id}</span>}
      />,
    )

    expect(screen.getByRole('treeitem')).not.toHaveAttribute('aria-expanded')
  })
})

describe('flattenTree, asked what can expand', () => {
  it('takes the caller’s word over what the nodes show', () => {
    const rows = flattenTree([{ id: 'assets', parentId: null }], new Set(), () => true)

    expect(rows[0]?.hasChildren).toBe(true)
  })
})
