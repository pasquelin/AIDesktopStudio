import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ViewSwitch, type ViewSwitchOption } from './ViewSwitch'

type TestView = 'simple' | 'expert'

const OPTIONS: readonly ViewSwitchOption<TestView>[] = [
  { id: 'simple', label: 'Simple', hint: 'Montre ce que le fichier fait' },
  { id: 'expert', label: 'Expert', hint: 'Ouvre chaque réglage' },
]

const switchOf = (onChange = vi.fn()) => {
  render(
    <ViewSwitch
      label="Façon de modifier"
      options={OPTIONS}
      value="simple"
      onChange={onChange}
      baseId="view-"
      panelId="view-panel"
    />,
  )
  return onChange
}

describe('the run of views of one document', () => {
  /**
   * 🛑 It was a row of chips, which carry `aria-pressed` — and `Chip` says in its own contract
   * that it is not a tab. Three readings of ONE file are tabs by every definition a reader has,
   * and the panel under them has to be reachable from the tab that names it.
   */
  it('is a tablist whose shown tab points at the panel it shows', () => {
    switchOf()

    const shown = screen.getByRole('tab', { name: 'Simple' })
    expect(shown).toHaveAttribute('aria-selected', 'true')
    expect(shown).toHaveAttribute('aria-controls', 'view-panel')
    expect(screen.getByRole('tablist', { name: 'Façon de modifier' })).toBeInTheDocument()
  })

  /** What a `tablist` promises: the arrows walk the run, and Tab leaves it in one press. */
  it('walks with the arrows, and keeps a single tab stop', async () => {
    const onChange = switchOf()

    screen.getByRole('tab', { name: 'Simple' }).focus()
    await userEvent.keyboard('{ArrowRight}')

    expect(onChange).toHaveBeenCalledWith('expert')
    expect(screen.getByRole('tab', { name: 'Expert' })).toHaveAttribute('tabindex', '-1')
  })
})
