import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CollectionBar } from './CollectionBar'
import { DEFAULT_COLLECTION_STATE, type FacetDescriptor } from '@/helpers/collectionState'

function facet(key: string): FacetDescriptor {
  return {
    key,
    label: key,
    options: [
      { value: `${key}-a`, label: `${key} A` },
      { value: `${key}-b`, label: `${key} B` },
    ],
  }
}

const FIVE = ['origin', 'capability', 'tag', 'publisher', 'period'].map(facet)

function renderBar(facets: FacetDescriptor[], props = {}) {
  const onChange = vi.fn()
  render(
    <CollectionBar
      scId="assets"
      state={DEFAULT_COLLECTION_STATE}
      onChange={onChange}
      facets={facets}
      {...props}
    />,
  )
  return { onChange }
}

describe('CollectionBar', () => {
  /**
   * Five stacked menus leave a side panel showing more filter than collection. Only the first
   * row stays out; the rest arrive on demand.
   */
  it('keeps the extra filters folded away until asked', async () => {
    renderBar(FIVE)

    expect(screen.getByLabelText('origin')).toBeInTheDocument()
    expect(screen.queryByLabelText('tag')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Plus de filtres/ }))

    expect(screen.getByLabelText('tag')).toBeInTheDocument()
    expect(screen.getByLabelText('period')).toBeInTheDocument()
  })

  it('folds them back', async () => {
    renderBar(FIVE)

    await userEvent.click(screen.getByRole('button', { name: /Plus de filtres/ }))
    await userEvent.click(screen.getByRole('button', { name: /Moins de filtres/ }))

    expect(screen.queryByLabelText('tag')).not.toBeInTheDocument()
  })

  it('offers no fold when everything already fits', () => {
    renderBar([facet('origin'), facet('capability')])

    expect(screen.queryByRole('button', { name: /filtres/ })).not.toBeInTheDocument()
  })

  it('reports a chosen facet value to its caller', async () => {
    const { onChange } = renderBar([facet('origin')])

    await userEvent.selectOptions(screen.getByLabelText('origin'), 'origin-b')

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ selections: { origin: ['origin-b'] } }),
    )
  })

  // A wide edge dock has room for one line, and folding there would hide what already fits.
  it('shows every filter at once when laid out inline', () => {
    renderBar(FIVE, { layout: 'inline' })

    expect(screen.getByLabelText('period')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /filtres/ })).not.toBeInTheDocument()
  })

  it('can give the spare width of an inline bar to search', () => {
    renderBar([], { layout: 'inline', growSearch: true })

    expect(screen.getByRole('searchbox').closest('label')).toHaveClass('flex-1')
  })
})
