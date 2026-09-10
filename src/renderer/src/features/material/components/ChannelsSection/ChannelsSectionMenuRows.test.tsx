import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ChannelsSectionMenuRows } from './ChannelsSectionMenuRows'
import type { ChannelDerivation } from '../../../shell/components/derivation'

const READY: ChannelDerivation = { source: 'baseColor', state: 'ready', run: vi.fn() }

const open = (derivation: ChannelDerivation | null = READY, inspected = false): void => {
  render(
    <div role="menu">
      <ChannelsSectionMenuRows
        derivation={derivation}
        inspected={inspected}
        channel="Normale"
        onShow={null}
        onInspect={vi.fn()}
        onClose={vi.fn()}
      />
    </div>,
  )
}

describe('what only a channel can be asked', () => {
  it('says what the row does to the channel rather than reading it back', () => {
    open()

    expect(screen.getByRole('menuitem', { name: /Calculer depuis/ })).toHaveAttribute(
      'data-tooltip-content',
      'Calcule ce canal à partir d’un autre plutôt que d’une image importée',
    )
  })

  // The row that refuses is the one most in need of saying what would let it work.
  it('names the channel to fill first when the source is empty', () => {
    open({ ...READY, state: 'missing' })

    const row = screen.getByRole('menuitem', {
      name: 'Calculer depuis Couleur de base — Couleur de base est vide',
    })
    expect(row).toBeDisabled()
  })

  it('leaves the visible label to answer for itself', () => {
    open()

    // An `aria-label` over a visible label replaces it for a screen reader (WCAG 2.5.3).
    for (const row of screen.getAllByRole('menuitem')) {
      expect(row).not.toHaveAttribute('aria-label')
    }
  })

  /**
   * Four of the eight channels compute from nothing — `baseColor` first among them — so the flat
   * view has to stand on its own, or those rows would answer a right-click with an empty surface.
   */
  it('offers the flat view on a channel that nothing computes', () => {
    open(null)

    expect(screen.getByRole('menuitem', { name: 'Regarder Normale seul' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /Calculer depuis/ })).toBeNull()
  })

  // One gesture in and out, rather than a second row to find.
  it('offers the way back once the channel is the one being looked at', () => {
    open(READY, true)

    expect(
      screen.getByRole('menuitem', { name: 'Revenir à la matière éclairée' }),
    ).toBeInTheDocument()
  })
})
