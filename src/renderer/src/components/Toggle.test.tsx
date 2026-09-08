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

  /** `-sm`, where the plugin measures both a switch and a tick box at `--size-selector * 5`. */
  it('stands at the gauge a ticked box does', () => {
    render(<Toggle aria-label="Enabled" />)

    expect(screen.getByRole('checkbox')).toHaveClass('toggle', 'toggle-sm')
  })
})
