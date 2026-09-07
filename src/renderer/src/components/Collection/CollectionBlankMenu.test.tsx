import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Collection, type CollectionProps } from './Collection'
import { DEFAULT_COLLECTION_STATE, type CollectionState } from '@/helpers/collectionState'

function renderCollection(
  items: Row[],
  overrides: Partial<CollectionState> = {},
  props: Partial<CollectionProps<Row>> = {},
) {
  return render(
    <Collection
      label="Rows"
      items={items}
      state={{ ...DEFAULT_COLLECTION_STATE, ...overrides }}
      renderCard={item => <span>{item.name}</span>}
      renderRow={item => <span>{item.name}</span>}
      {...props}
    />,
  )
}

function rows(count: number): Row[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `row_${index}`,
    name: `Row ${index}`,
  }))
}

type Row = { id: string; name: string }

describe('Collection, the blank a grid has and a list has not', () => {
  it('raises the root menu from the row geometry beside a card', () => {
    const onContextMenuRoot = vi.fn()
    renderCollection(rows(3), { view: 'grid' }, { onSelect: vi.fn(), onContextMenuRoot })

    // The row, not the scroller: it spans the width, so it IS what lies beside a card.
    fireEvent.contextMenu(screen.getByText('Row 0').closest('[role="option"]')!.parentElement!)

    expect(onContextMenuRoot).toHaveBeenCalled()
  })

  it('raises it from the box the virtualizer sizes, which lies under every row', () => {
    const onContextMenuRoot = vi.fn()
    renderCollection(rows(3), { view: 'grid' }, { onSelect: vi.fn(), onContextMenuRoot })

    fireEvent.contextMenu(screen.getByRole('listbox'))

    expect(onContextMenuRoot).toHaveBeenCalled()
  })

  it('leaves a card alone, which is the whole point of asking', () => {
    const onContextMenuRoot = vi.fn()
    renderCollection(rows(3), { view: 'grid' }, { onSelect: vi.fn(), onContextMenuRoot })

    fireEvent.contextMenu(screen.getByText('Row 0'))

    expect(onContextMenuRoot).not.toHaveBeenCalled()
  })
})
