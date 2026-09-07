import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Collection, type CollectionProps } from './Collection'
import { refreshPalette } from '@/engines/core/palette'
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

describe('Collection, the height it estimates', () => {
  afterEach(() => {
    document.documentElement.style.removeProperty('--sc-control')
    document.documentElement.style.removeProperty('--sc-row-stacked')
    refreshPalette()
  })

  const listOf = (count: number, props: Partial<CollectionProps<Row>> = {}) =>
    renderCollection(rows(count), { view: 'list' }, { onSelect: vi.fn(), ...props })

  /**
   * Each row reserves its height plus `ROW_GAP`. A constant estimate is only right at one
   * density: three compact rows at 24 are 84px, and estimating them at 28 reserves twelve
   * pixels nobody paints — the dead band this lot was opened for.
   */
  it('estimates the gauge its rows are drawn at, not a constant', () => {
    document.documentElement.style.setProperty('--sc-control', '24px')
    refreshPalette()

    listOf(3)

    expect(screen.getByRole('listbox')).toHaveStyle({ height: '84px' })
  })

  it('falls back to the shipped height when no gauge is declared', () => {
    listOf(3)

    expect(screen.getByRole('listbox')).toHaveStyle({ height: '96px' })
  })

  /**
   * A row stacking a name over a subtitle reads its own gauge. Two steps of `leading-tight` text
   * are 27.5px, so the control height leaves nothing at all — which is what the recent projects
   * panel showed, its rows touching each other.
   */
  it('gives a stacked row the taller gauge', () => {
    document.documentElement.style.setProperty('--sc-row-stacked', '32px')
    refreshPalette()

    listOf(3, { rowHeight: 'stacked' })

    expect(screen.getByRole('listbox')).toHaveStyle({ height: '108px' })
  })

  it('leaves a stacked row taller than a plain one at the same density', () => {
    listOf(3, { rowHeight: 'stacked' })

    // The shipped fallback, 36 + 4 of gap, three times — no gauge is declared under jsdom.
    expect(screen.getByRole('listbox')).toHaveStyle({ height: '120px' })
  })

  /**
   * The same two steps of text, in a row painted edge to edge: the fill takes off the room a bare
   * row keeps, so it asks for its own gauge. Kept apart from `stacked` because raising THAT one
   * for the home's filled rows loosened the explorer and the documents panel, which fill nothing.
   */
  it('leaves a filled row taller still, on a gauge of its own', () => {
    listOf(3, { rowHeight: 'filled' })

    expect(screen.getByRole('listbox')).toHaveStyle({ height: '144px' })
  })

  /**
   * Switching density under a mounted list. The virtualizer memoizes on `count`, never on the
   * estimator, so without a re-measure the rows keep the height the density just left.
   */
  it('re-measures when the density changes under a mounted list', () => {
    document.documentElement.style.setProperty('--sc-control', '28px')
    refreshPalette()
    listOf(3)
    expect(screen.getByRole('listbox')).toHaveStyle({ height: '96px' })

    act(() => {
      document.documentElement.style.setProperty('--sc-control', '24px')
      refreshPalette()
    })

    expect(screen.getByRole('listbox')).toHaveStyle({ height: '84px' })
  })
})
