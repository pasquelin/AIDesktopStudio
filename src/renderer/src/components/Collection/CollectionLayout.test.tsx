import { useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

describe('Collection', () => {
  describe('a row that opens', () => {
    /** What the shelf does with a picked asset: it opens under its own line, inside the list. */
    it('draws its detail under the row the chevron was pressed on', async () => {
      function Opening() {
        const [open, setOpen] = useState<string | null>(null)
        return (
          <Collection
            label="Rows"
            items={rows(3)}
            state={{ ...DEFAULT_COLLECTION_STATE, view: 'list' }}
            renderRow={item => <span>{item.name}</span>}
            onSelect={() => {}}
            expandedId={open}
            onToggleRow={item => setOpen(current => (current === item.id ? null : item.id))}
            renderRowDetail={item => <p>about {item.name}</p>}
          />
        )
      }

      render(<Opening />)
      expect(screen.queryByText('about Row 1')).not.toBeInTheDocument()

      const cell = screen.getByText('Row 1').closest('[data-cell]')
      const chevron = cell?.querySelector('[data-chevron]')
      expect(chevron).not.toBeNull()
      fireEvent.pointerDown(chevron as Element)

      expect(await screen.findByText('about Row 1')).toBeInTheDocument()
      // One at a time, and the others say nothing.
      expect(screen.queryByText('about Row 0')).not.toBeInTheDocument()
    })

    /**
     * 🛑 The three gestures a chevron must swallow, and they belong to two different hosts: this
     * list selects on CLICK and opens the row on DOUBLE-CLICK, where `Tree` selects on pointer
     * down. Reading a row must not collapse a selection of five onto it.
     */
    it('picks nothing and opens nothing when the twist itself is pressed', async () => {
      const onSelect = vi.fn()
      const onActivate = vi.fn()
      renderCollection(
        rows(3),
        { view: 'list' },
        {
          onSelect,
          onActivate,
          renderRowDetail: item => <p>about {item.name}</p>,
          expandedId: null,
        },
      )

      const chevron = screen
        .getByText('Row 1')
        .closest('[data-cell]')
        ?.querySelector('[data-chevron]')
      await userEvent.dblClick(chevron as Element)

      expect(onSelect).not.toHaveBeenCalled()
      expect(onActivate).not.toHaveBeenCalled()
    })

    /**
     * 🛑 The twist stands BESIDE the name, never above it. jsdom lays nothing out, so what is
     * read here is the class that decides it: without `flex`, the chevron and the row stacked
     * and every line of the shelf drew its glyph over its own name, at twice the height.
     */
    it('lays the twist beside the row rather than above it', () => {
      renderCollection(
        rows(2),
        { view: 'list' },
        { onSelect: () => {}, renderRowDetail: item => <p>about {item.name}</p> },
      )

      const cell = screen.getByText('Row 0').closest('[data-cell]')
      expect(cell?.className).toContain('flex')
      expect(cell?.querySelector('[data-chevron]')).not.toBeNull()
    })

    /** A chevron on a line that opens onto nothing is a promise the list cannot keep. */
    it('draws no twist on a row that answers no to `canOpen`', () => {
      renderCollection(
        rows(3),
        { view: 'list' },
        {
          onSelect: () => {},
          renderRowDetail: item => <p>about {item.name}</p>,
          canOpen: item => item.id !== 'row_1',
        },
      )

      const twisted = screen.getAllByText(/^Row \d+$/).map(name => {
        const cell = name.closest('[data-cell]')
        expect(cell).not.toBeNull()
        return cell?.querySelector('[data-chevron] svg') !== null
      })

      expect(twisted).toEqual([true, false, true])
    })
  })

  it('renders a window over the items rather than all of them', () => {
    renderCollection(rows(2000))

    const rendered = screen.getAllByText(/^Row \d+$/)
    expect(rendered.length).toBeGreaterThan(0)
    expect(rendered.length).toBeLessThan(200)
    expect(screen.getByText('Row 0')).toBeInTheDocument()
  })

  it('virtualizes the list view too', () => {
    renderCollection(rows(2000), { view: 'list' })

    expect(screen.getAllByText(/^Row \d+$/).length).toBeLessThan(200)
  })

  // A panel with no thumbnails would otherwise show a grid of empty squares.
  it('stays a list when no card renderer is given, whatever the state says', () => {
    render(
      <Collection
        label="Rows"
        items={rows(3)}
        state={{ ...DEFAULT_COLLECTION_STATE, view: 'grid' }}
        renderRow={item => <span>row {item.name}</span>}
      />,
    )

    expect(screen.getByText('row Row 0')).toBeInTheDocument()
  })

  /**
   * The selection is painted on the cell, and a card is an opaque tile of exactly the cell's
   * size: flush, it covered `bg-accent-soft` to the last pixel. The shelf said "3 items" over
   * three squares indistinguishable from the rest — while the same selection read perfectly in
   * list view, where nothing sits on top of the row.
   */
  it('insets a card so the selection painted under it is not covered', () => {
    renderCollection(rows(4), {}, { onSelect: vi.fn(), selectedIds: ['row_0'] })

    const cell = screen.getByText('Row 0').closest('[data-cell]')

    expect(cell).toHaveClass('bg-accent-soft')
    expect(cell).toHaveClass('p-1')
  })

  it('leaves a list row flush, where nothing is drawn over it', () => {
    renderCollection(rows(4), { view: 'list' }, { onSelect: vi.fn(), selectedIds: ['row_0'] })

    const cell = screen.getByText('Row 0').closest('[data-cell]')

    expect(cell).toHaveClass('bg-accent-soft')
    expect(cell).not.toHaveClass('p-1')
  })

  it('lays out more columns as the thumbnails shrink', () => {
    const { rerender } = renderCollection(rows(500), { thumbnailSize: 200 })
    const wide = screen.getAllByText(/^Row \d+$/).length

    rerender(
      <Collection
        label="Rows"
        items={rows(500)}
        state={{ ...DEFAULT_COLLECTION_STATE, thumbnailSize: 64 }}
        renderCard={item => <span>{item.name}</span>}
        renderRow={item => <span>{item.name}</span>}
      />,
    )

    expect(screen.getAllByText(/^Row \d+$/).length).toBeGreaterThan(wide)
  })

  it('shows the empty node in place of the items, and only then', () => {
    renderCollection([], {}, { empty: <p>Nothing here</p> })
    expect(screen.getByText('Nothing here')).toBeInTheDocument()

    renderCollection(rows(4), {}, { empty: <p>Still nothing</p> })
    expect(screen.queryByText('Still nothing')).not.toBeInTheDocument()
  })

  // The end is announced before it is reached, so the next page lands before the gap shows.
  it('asks for more as the end nears', async () => {
    const onReachEnd = vi.fn()
    renderCollection(rows(6), {}, { onReachEnd })

    await waitFor(() => expect(onReachEnd).toHaveBeenCalled())
  })

  // Asking for more with nothing on screen loops until the source runs dry.
  it('does not ask for more when it has nothing to show', () => {
    const onReachEnd = vi.fn()
    renderCollection([], {}, { onReachEnd })

    expect(onReachEnd).not.toHaveBeenCalled()
  })

  it('does not ask for more while the end is far below', () => {
    const onReachEnd = vi.fn()
    renderCollection(rows(4000), {}, { onReachEnd })

    expect(onReachEnd).not.toHaveBeenCalled()
  })

  it('reports the items on screen, not the whole collection', async () => {
    const onVisible = vi.fn()
    renderCollection(rows(2000), {}, { onVisible })

    await waitFor(() => expect(onVisible).toHaveBeenCalled())
    const reported = onVisible.mock.calls.at(-1)?.[0] ?? []

    expect(reported[0]).toEqual({ id: 'row_0', name: 'Row 0' })
    expect(reported.length).toBeLessThan(200)
  })
})
