import { fireEvent, render, screen } from '@testing-library/react'
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
  it('leaves the rows undraggable when nothing listens for a drop', () => {
    renderTree()
    expect(screen.getAllByRole('treeitem')[0]).not.toHaveAttribute('draggable', 'true')
  })

  it('reports a row dropped onto another', () => {
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
    const data = dragTransfer()
    fireEvent.dragStart(rows[1]!, { dataTransfer: data })
    fireEvent.dragOver(rows[2]!, { dataTransfer: data })
    fireEvent.drop(rows[2]!, { dataTransfer: data })

    expect(onDrop).toHaveBeenCalledWith(['a'], 'b')
  })

  // Dropping a row onto itself is the gesture of someone who changed their mind.
  it('says nothing when a row is dropped onto itself', () => {
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

    const row = screen.getAllByRole('treeitem')[1]!
    const data = dragTransfer()
    fireEvent.dragStart(row, { dataTransfer: data })
    fireEvent.drop(row, { dataTransfer: data })

    expect(onDrop).not.toHaveBeenCalled()
  })

  it('refuses to pick up a row the caller will not let move', () => {
    render(
      <Tree
        nodes={NODES}
        label="Outline"
        selectedIds={[]}
        expandedIds={new Set(['scene'])}
        onSelect={() => {}}
        onToggle={() => {}}
        onDrop={() => {}}
        draggable={node => node.id !== 'a'}
        renderRow={row => <span>{row.node.id}</span>}
      />,
    )

    const [, refused, allowed] = screen.getAllByRole('treeitem')
    expect(refused).not.toHaveAttribute('draggable', 'true')
    expect(allowed).toHaveAttribute('draggable', 'true')
  })

  it('drops nothing on a row the caller will not let receive', () => {
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
        droppable={node => node.id !== 'b'}
        renderRow={row => <span>{row.node.id}</span>}
      />,
    )

    const rows = screen.getAllByRole('treeitem')
    const data = dragTransfer()
    fireEvent.dragStart(rows[1]!, { dataTransfer: data })
    fireEvent.drop(rows[2]!, { dataTransfer: data })

    expect(onDrop).not.toHaveBeenCalled()
  })

  // A row that will not take the drop must not offer to: the refusal belongs in the hand, not
  // at the release, and the outline is the whole of what the hand sees.
  it('draws no landing outline on a row it would refuse', () => {
    render(
      <Tree
        nodes={NODES}
        label="Outline"
        selectedIds={[]}
        expandedIds={new Set(['scene'])}
        onSelect={() => {}}
        onToggle={() => {}}
        onDrop={() => {}}
        droppable={node => node.id !== 'b'}
        renderRow={row => <span>{row.node.id}</span>}
      />,
    )

    const rows = screen.getAllByRole('treeitem')
    const data = dragTransfer()
    fireEvent.dragStart(rows[1]!, { dataTransfer: data })
    fireEvent.dragOver(rows[2]!, { dataTransfer: data })
    expect(rows[2]!.className).not.toContain('outline-accent')

    fireEvent.dragOver(rows[0]!, { dataTransfer: data })
    expect(screen.getAllByRole('treeitem')[0]!.className).toContain('outline-accent')
  })
})
