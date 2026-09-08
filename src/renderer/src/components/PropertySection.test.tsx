import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { anySectionOpen, useSectionFolds } from '@/stores/sectionFolds'
import { SectionFoldScope } from './SectionFoldScope'
import { PropertySection } from './PropertySection'

describe('PropertySection', () => {
  // Module-wide: a case that gives an order would otherwise hand it to every case after it.
  beforeEach(() => useSectionFolds.setState({ stamp: 0, wanted: true, sectionsOpen: new Map() }))

  it('shows its content under its heading', () => {
    render(
      <PropertySection title="Transform">
        <p>fields</p>
      </PropertySection>,
    )

    expect(screen.getByText('fields')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Transform/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
  })

  // One heading, two gestures: what a click does depends on where it already stands.
  it('says which of its two gestures a click would do', async () => {
    render(
      <PropertySection title="Transform">
        <p>fields</p>
      </PropertySection>,
    )
    const heading = screen.getByRole('button', { name: /Transform/ })

    expect(heading).toHaveAttribute('data-tooltip-content', 'Replie ce groupe de propriétés')

    await userEvent.click(heading)

    expect(heading).toHaveAttribute('data-tooltip-content', 'Déplie ce groupe de propriétés')
  })

  it('folds and unfolds on its heading', async () => {
    render(
      <PropertySection title="Transform">
        <p>fields</p>
      </PropertySection>,
    )
    const heading = screen.getByRole('button', { name: /Transform/ })

    await userEvent.click(heading)
    expect(screen.queryByText('fields')).not.toBeInTheDocument()
    expect(heading).toHaveAttribute('aria-expanded', 'false')

    await userEvent.click(heading)
    expect(screen.getByText('fields')).toBeInTheDocument()
  })

  /**
   * The panel's title row is rendered by the dock from somewhere else entirely, so what reaches a
   * section is an ORDER rather than a shared open state — and one that folded a section already
   * folded by hand would leave the button lying about what a second press does.
   */
  describe('an order given to every section at once', () => {
    it('folds a section that was open, and opens one that was folded', () => {
      render(
        <>
          <PropertySection title="Transform">
            <p>open by hand</p>
          </PropertySection>
          <PropertySection title="Material" defaultOpen={false}>
            <p>folded by hand</p>
          </PropertySection>
        </>,
      )

      act(() => useSectionFolds.getState().askAllSections())
      expect(screen.queryByText('open by hand')).not.toBeInTheDocument()
      expect(screen.queryByText('folded by hand')).not.toBeInTheDocument()

      act(() => useSectionFolds.getState().askAllSections())
      expect(screen.getByText('open by hand')).toBeInTheDocument()
      expect(screen.getByText('folded by hand')).toBeInTheDocument()
    })

    // A section mounted after the order — the inspector swaps its whole face on every selection —
    // opens on what it was written to open on, never on an order it never saw.
    it('leaves a section that arrives later on its own default', () => {
      act(() => useSectionFolds.getState().askAllSections())
      render(
        <PropertySection title="Transform">
          <p>fields</p>
        </PropertySection>,
      )

      expect(screen.getByText('fields')).toBeInTheDocument()
    })

    /**
     * A section drawn outside the panel that carries the button — the shelf reads its picked
     * asset out in sections of its own — is neither counted by the offer nor moved by the order.
     */
    it('passes a section by when its scope says the order is not its panel’s', () => {
      render(
        <SectionFoldScope value={false}>
          <PropertySection title="Identity">
            <p>elsewhere</p>
          </PropertySection>
        </SectionFoldScope>,
      )

      expect(anySectionOpen(useSectionFolds.getState())).toBe(false)

      act(() => useSectionFolds.getState().askAllSections())
      expect(screen.getByText('elsewhere')).toBeInTheDocument()
    })
  })

  /**
   * A document opened in the centre carries formats nobody has seen before, where a dock panel
   * describes a selection the reader already made. The sentence goes with the rows: kept while
   * folded, it explained fields nobody could see.
   */
  it('explains what its rows are for, and stops explaining once folded', async () => {
    render(
      <PropertySection title="Context" description="What this set of controls is called.">
        <p>fields</p>
      </PropertySection>,
    )

    expect(screen.getByText('What this set of controls is called.')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Context/ }))

    expect(screen.queryByText('What this set of controls is called.')).not.toBeInTheDocument()
  })

  it('can start folded', () => {
    render(
      <PropertySection title="Material" defaultOpen={false}>
        <p>fields</p>
      </PropertySection>,
    )

    expect(screen.queryByText('fields')).not.toBeInTheDocument()
  })
})
