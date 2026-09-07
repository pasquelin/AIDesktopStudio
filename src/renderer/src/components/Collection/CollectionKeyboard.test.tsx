import { render, screen, waitFor } from '@testing-library/react'
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
  // The virtualizer only mounts a window: an anchor scrolled far out of it used to take the tab
  // stop with it, and the whole collection fell out of the tab order.
  it('keeps its tab stop when the anchor is nowhere near the mounted window', () => {
    renderCollection(rows(500), { view: 'list' }, { onSelect: vi.fn(), selectedIds: ['row_400'] })

    expect(screen.getAllByRole('option').some(cell => cell.tabIndex === 0)).toBe(true)
  })

  // Space scrolls a focused list, and picks rows everywhere else in the studio. A panel that
  // only opens its rows must not turn it into "open", which can switch workspace.
  it('leaves Space alone on a row it can only open', async () => {
    const onActivate = vi.fn()
    renderCollection(rows(4), { view: 'list' }, { onActivate })

    await userEvent.tab()
    await userEvent.keyboard(' ')

    expect(onActivate).not.toHaveBeenCalled()
  })

  it('walks the cells with the arrows and activates on Enter, without a mouse', async () => {
    const onActivate = vi.fn()
    renderCollection(rows(4), { view: 'list' }, { onActivate })

    await userEvent.tab()
    await userEvent.keyboard('{ArrowDown}')
    await userEvent.keyboard('{Enter}')

    expect(onActivate).toHaveBeenCalledWith({ id: 'row_1', name: 'Row 1' })
  })

  it('activates on a double-click, so the caller stops wiring one of its own', async () => {
    const onActivate = vi.fn()
    renderCollection(rows(4), { view: 'list' }, { onActivate })

    await userEvent.dblClick(screen.getByText('Row 2'))

    expect(onActivate).toHaveBeenCalledWith({ id: 'row_2', name: 'Row 2' })
  })

  // Enter opens and Space picks, the way a file browser answers both: a collection that can do
  // the two must not make the opening gesture also move the selection.
  it('opens on Enter and selects on Space when it can do both', async () => {
    const onActivate = vi.fn()
    const onSelect = vi.fn()
    renderCollection(rows(4), { view: 'list' }, { onActivate, onSelect })

    await userEvent.tab()
    await userEvent.keyboard('{Enter}')
    expect(onActivate).toHaveBeenCalledWith({ id: 'row_0', name: 'Row 0' })
    expect(onSelect).not.toHaveBeenCalled()

    await userEvent.keyboard(' ')
    expect(onSelect).toHaveBeenCalledWith({ id: 'row_0', name: 'Row 0' }, ['row_0'], 'replace')
  })

  // A cell per tab makes a catalogue of five hundred models five hundred presses deep.
  it('offers a single tab stop, whatever the collection holds', () => {
    renderCollection(rows(200), { view: 'list' }, { onSelect: vi.fn() })

    const reachable = screen.getAllByRole('option').filter(cell => cell.tabIndex === 0)
    expect(reachable).toHaveLength(1)
  })

  it('puts that tab stop on the selected item, so tab lands where the eye is', () => {
    renderCollection(rows(20), { view: 'list' }, { onSelect: vi.fn(), selectedIds: ['row_3'] })

    const reachable = screen.getAllByRole('option').find(cell => cell.tabIndex === 0)
    expect(reachable).toHaveTextContent('Row 3')
  })

  it('walks the cells with the arrows, since only one of them takes a tab', async () => {
    renderCollection(rows(20), { view: 'list' }, { onSelect: vi.fn() })

    await userEvent.tab()
    await userEvent.keyboard('{ArrowDown}')

    expect(screen.getByText('Row 1').closest('[role="option"]')).toHaveFocus()

    await userEvent.keyboard('{ArrowUp}')
    expect(screen.getByText('Row 0').closest('[role="option"]')).toHaveFocus()
  })

  it('moves one card sideways and a whole row down, in a grid', async () => {
    renderCollection(rows(40), { view: 'grid' }, { onSelect: vi.fn() })

    await userEvent.tab()
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByText('Row 1').closest('[role="option"]')).toHaveFocus()

    // A row down lands a full row further, whatever width jsdom decided to measure.
    const before = document.activeElement?.getAttribute('data-cell')
    await userEvent.keyboard('{ArrowDown}')
    const after = document.activeElement?.getAttribute('data-cell')
    expect(Number(after) - Number(before)).toBeGreaterThan(1)
  })

  it('stops at the edges rather than wrapping around', async () => {
    renderCollection(rows(5), { view: 'list' }, { onSelect: vi.fn() })

    await userEvent.tab()
    await userEvent.keyboard('{ArrowUp}')

    expect(screen.getByText('Row 0').closest('[role="option"]')).toHaveFocus()
  })

  /** The other way along a row of cards — the one direction the walk had never been asked for. */
  it('moves one card back with the left arrow', async () => {
    renderCollection(rows(40), { view: 'grid' }, { onSelect: vi.fn() })

    await userEvent.tab()
    await userEvent.keyboard('{ArrowRight}{ArrowLeft}')

    expect(screen.getByText('Row 0').closest('[role="option"]')).toHaveFocus()
  })

  /**
   * A key that is not an arrow is nobody's business here: swallowing it would take type-ahead
   * and every shortcut away from a focused row.
   */
  it('leaves a key that is not an arrow alone', async () => {
    renderCollection(rows(5), { view: 'list' }, { onSelect: vi.fn() })

    await userEvent.tab()
    const focused = document.activeElement
    await userEvent.keyboard('a')

    expect(document.activeElement).toBe(focused)
  })

  /**
   * A refused row stays listed, reachable and announced — it is `aria-disabled`, not removed.
   * A cell taken out of reach is a cell whose tooltip nobody can read, and that tooltip is
   * usually the only thing on screen saying why the row is refused.
   */
  describe('a refused item', () => {
    const refuseFirst = (props: Partial<CollectionProps<Row>> = {}) =>
      renderCollection(
        rows(5),
        { view: 'list' },
        { isDisabled: item => item.id === 'row_0', ...props },
      )

    const cellOf = (name: string): HTMLElement | null =>
      screen.getByText(name).closest('[role="option"]')

    it('is announced as disabled, and its neighbours are not', () => {
      refuseFirst({ onSelect: vi.fn() })

      expect(cellOf('Row 0')).toHaveAttribute('aria-disabled', 'true')
      expect(cellOf('Row 1')).not.toHaveAttribute('aria-disabled')
    })

    it('is not selected by a click', async () => {
      const onSelect = vi.fn()
      refuseFirst({ onSelect })

      await userEvent.click(screen.getByText('Row 0'))

      expect(onSelect).not.toHaveBeenCalled()
    })

    it('is not opened by a double click', async () => {
      const onActivate = vi.fn()
      refuseFirst({ onSelect: vi.fn(), onActivate })

      await userEvent.dblClick(screen.getByText('Row 0'))

      expect(onActivate).not.toHaveBeenCalled()
    })

    it('is not selected by the keyboard either', async () => {
      const onSelect = vi.fn()
      refuseFirst({ onSelect })

      await userEvent.tab()
      await userEvent.keyboard(' ')

      expect(onSelect).not.toHaveBeenCalled()
    })

    // Stopping the arrows on it would strand the keyboard: the row keeps its place in the list.
    it('still lets the arrows walk through it', async () => {
      refuseFirst({ onSelect: vi.fn() })

      await userEvent.tab()
      expect(cellOf('Row 0')).toHaveFocus()

      await userEvent.keyboard('{ArrowDown}')
      await waitFor(() => expect(cellOf('Row 1')).toHaveFocus())
    })
  })
})
