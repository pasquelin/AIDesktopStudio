import { render, screen } from '@testing-library/react'
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
  it('selects on click and marks the selected item', async () => {
    const onSelect = vi.fn()
    renderCollection(rows(4), {}, { onSelect, selectedIds: ['row_1'] })

    await userEvent.click(screen.getByText('Row 2'))

    expect(onSelect).toHaveBeenCalledWith({ id: 'row_2', name: 'Row 2' }, ['row_2'], 'replace')
    expect(screen.getByText('Row 1').closest('[role="option"]')).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it('selects with the keyboard, so the collection is reachable without a mouse', async () => {
    const onSelect = vi.fn()
    renderCollection(rows(4), {}, { onSelect })

    await userEvent.tab()
    await userEvent.keyboard('{Enter}')

    expect(onSelect).toHaveBeenCalledWith({ id: 'row_0', name: 'Row 0' }, ['row_0'], 'replace')
  })

  // The same gesture the tree offers, so a row behaves alike whichever panel lists it.
  it('extends over the items between the anchor and a shift-clicked one', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    renderCollection(rows(4), {}, { onSelect, selectedIds: ['row_0'] })

    await user.keyboard('{Shift>}')
    await user.click(screen.getByText('Row 2'))
    await user.keyboard('{/Shift}')

    expect(onSelect.mock.calls[0]?.slice(1)).toEqual([['row_0', 'row_1', 'row_2'], 'replace'])
  })

  it('paints every selected item, not only the anchor', () => {
    renderCollection(rows(4), {}, { onSelect: vi.fn(), selectedIds: ['row_0', 'row_2'] })

    const selected = screen
      .getAllByRole('option')
      .filter(cell => cell.getAttribute('aria-selected') === 'true')
    expect(selected).toHaveLength(2)
  })

  // The eye of a layer or a node sits inside the row and answers Enter itself. Selecting on top
  // of it is the keyboard version of the click theft `VisibilityToggle` was written to stop.
  it('leaves the row alone when a control inside it takes the key', async () => {
    const onSelect = vi.fn()
    const onActivate = vi.fn()
    const onToggle = vi.fn()
    renderCollection(
      rows(4),
      { view: 'list' },
      {
        onSelect,
        onActivate,
        // Stops the click the way `VisibilityToggle` does — the key press is the part the cell
        // has to handle, since stopping a click never reaches it.
        renderRow: (row: Row) => (
          <span>
            {row.name}
            <button
              onClick={event => {
                event.stopPropagation()
                onToggle()
              }}
            >
              eye
            </button>
          </span>
        ),
      },
    )

    screen.getAllByRole('button', { name: 'eye' })[1]?.focus()
    await userEvent.keyboard('{Enter}')

    expect(onToggle).toHaveBeenCalled()
    expect(onSelect).not.toHaveBeenCalled()
    expect(onActivate).not.toHaveBeenCalled()
  })

  /**
   * `option` on its own is invalid ARIA: without a `listbox` around it, a screen reader
   * announces neither the list nor "3 of 12", and some engines drop the role entirely.
   */
  it('wraps its cells in a listbox, so a reader can count them', () => {
    renderCollection(rows(4), { view: 'list' }, { onSelect: vi.fn() })

    const listbox = screen.getByRole('listbox')
    expect(listbox).toBeInTheDocument()
    expect(screen.getAllByRole('option')[0]?.closest('[role="listbox"]')).toBe(listbox)
  })

  // A shelf whose rows are only opened selects nothing: saying "selected" of a row the user
  // cannot pick describes a state they can neither set nor clear.
  it('is a plain list when its rows can only be opened', () => {
    renderCollection(rows(4), { view: 'list' }, { onActivate: vi.fn() })

    expect(screen.getByRole('list')).toBeInTheDocument()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.getAllByRole('listitem')[0]).not.toHaveAttribute('aria-selected')
  })

  /**
   * Opening on a single click is still opening. Wired through `onSelect` for want of anything
   * else, it announced a `listbox` whose rows are never selected.
   */
  describe('a list whose rows open on a single click', () => {
    it('stays a list rather than becoming a listbox', () => {
      renderCollection(rows(4), { view: 'list' }, { onOpen: vi.fn() })

      expect(screen.getByRole('list')).toBeInTheDocument()
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
      expect(screen.getAllByRole('listitem')[0]).not.toHaveAttribute('aria-selected')
    })

    it('opens the row that was clicked, once', async () => {
      const onOpen = vi.fn()
      renderCollection(rows(4), { view: 'list' }, { onOpen })

      await userEvent.click(screen.getByText('Row 1'))

      expect(onOpen).toHaveBeenCalledTimes(1)
      expect(onOpen.mock.calls[0]?.[0]).toMatchObject({ name: 'Row 1' })
    })

    it('opens from the keyboard too, which is what a wired-up click would have lost', async () => {
      const onOpen = vi.fn()
      renderCollection(rows(4), { view: 'list' }, { onOpen })

      await userEvent.tab()
      await userEvent.keyboard('{Enter}')

      expect(onOpen).toHaveBeenCalledTimes(1)
    })
  })

  // A `listbox` is a widget, and an unnamed widget is announced as the bare word "listbox" —
  // the same word in each of the six panels that draw one.
  it('names the list it draws', () => {
    renderCollection(rows(4), { view: 'list' }, { onSelect: vi.fn() })

    expect(screen.getByRole('listbox', { name: 'Rows' })).toBeInTheDocument()
  })

  // `aria-multiselectable` defaults to false, which promises at most one selected row. Three of
  // the six panels keep a single id, so the answer belongs to the caller.
  it('says whether picking one row keeps the others', () => {
    renderCollection(rows(4), { view: 'list' }, { onSelect: vi.fn(), multiple: true })
    expect(screen.getByRole('listbox')).toHaveAttribute('aria-multiselectable', 'true')

    renderCollection(rows(4), { view: 'list' }, { onSelect: vi.fn() })
    expect(screen.getAllByRole('listbox')[1]).toHaveAttribute('aria-multiselectable', 'false')
  })

  // The virtualizer mounts a window of about thirty rows: counted from the tree alone, a
  // catalogue of two thousand models announces itself as a list of thirty.
  it('says how many items there are, not how many are mounted', () => {
    renderCollection(rows(2000), { view: 'list' }, { onSelect: vi.fn() })

    const first = screen.getAllByRole('option')[0]
    expect(first).toHaveAttribute('aria-setsize', '2000')
    expect(first).toHaveAttribute('aria-posinset', '1')
  })

  it('names no list at all when its cells answer to nothing', () => {
    renderCollection(rows(4), { view: 'list' })

    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('leaves cells out of the tab order when nothing can be selected nor activated', () => {
    renderCollection(rows(4))

    expect(screen.queryByRole('option')).not.toBeInTheDocument()
  })

  // A panel whose rows are opened rather than selected — the explorer — is reached the same
  // way as one whose rows are picked: what a cell answers to is not what puts it in reach.
  it('keeps a cell reachable when it can only be activated', () => {
    renderCollection(rows(4), { view: 'list' }, { onActivate: vi.fn() })

    expect(screen.getAllByRole('listitem').some(cell => cell.tabIndex === 0)).toBe(true)
  })

  /**
   * The tab stop is looked up by walking the items, and the virtualizer re-renders this whole
   * component every time its window moves by a row — so a scroll paid that walk per row, over the
   * catalogue rather than over what is mounted.
   */
  it('reads a bounded number of ids per render, whatever the catalogue holds', () => {
    let reads = 0
    const counted = Array.from({ length: 2000 }, (_, index) => ({
      get id() {
        reads += 1
        return `row_${index}`
      },
      name: `Row ${index}`,
    }))
    // Nothing picked, which is the nominal state of two of the six panels: the walk read every
    // id to answer that there is no anchor.
    const props = { onSelect: vi.fn() }

    const view = renderCollection(counted, { view: 'list' }, props)
    reads = 0
    // Ten renders, as a scroll of a few hundred pixels asks for.
    for (let tick = 0; tick < 10; tick += 1) {
      view.rerender(
        <Collection
          label="Rows"
          items={counted}
          state={{ ...DEFAULT_COLLECTION_STATE, view: 'list' }}
          renderCard={item => <span>{item.name}</span>}
          renderRow={item => <span>{item.name}</span>}
          {...props}
        />,
      )
    }

    expect(reads).toBeLessThan(1_000)
  })
})
