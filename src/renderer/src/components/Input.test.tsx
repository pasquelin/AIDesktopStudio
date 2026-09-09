import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Input } from './Input'

describe('Input', () => {
  it('reports what is typed into it', () => {
    const onChange = vi.fn()
    render(<Input aria-label="Name" onChange={onChange} />)

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Croquis' } })

    expect(onChange).toHaveBeenCalled()
    expect(screen.getByRole('textbox')).toHaveValue('Croquis')
  })

  /**
   * The gauge and the border are the plugin's; what a host adds is room inside the field — the
   * left inset a magnifier takes, the coloured start border of an axis.
   */
  it('wears the plugin field, and takes the room a host adds inside it', () => {
    render(<Input aria-label="Search" className="ps-7" />)

    expect(screen.getByRole('textbox')).toHaveClass('input', 'input-sm', 'w-full', 'ps-7')
  })

  it('prefixes a bare handle, and writes none when it was given none', () => {
    const { rerender } = render(<Input aria-label="Name" data-sc="layer.name" />)
    expect(screen.getByRole('textbox')).toHaveAttribute('data-sc', 'field:layer.name')

    rerender(<Input aria-label="Name" />)
    expect(screen.getByRole('textbox')).not.toHaveAttribute('data-sc')
  })
})
