import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Toggle } from './Toggle'

describe('Toggle', () => {
  it('reports the flip', () => {
    const onChange = vi.fn()
    render(<Toggle aria-label="Enabled" onChange={onChange} />)

    fireEvent.click(screen.getByRole('checkbox'))

    expect(onChange).toHaveBeenCalled()
    expect(screen.getByRole('checkbox')).toBeChecked()
  })

  /**
   * `-md` and not `-sm`, because the plugin measures a switch at `--size-selector * 5` on the
   * first and `* 4` on the second: `-md` is the step that lands on the 16px a ticked box takes.
   */
  it('stands at the gauge a ticked box does', () => {
    render(<Toggle aria-label="Enabled" />)

    expect(screen.getByRole('checkbox')).toHaveClass('toggle', 'toggle-md')
  })
})
