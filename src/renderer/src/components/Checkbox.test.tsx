import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Checkbox } from './Checkbox'

describe('Checkbox', () => {
  it('reports the tick', () => {
    const onChange = vi.fn()
    render(<Checkbox aria-label="Amend" onChange={onChange} />)

    fireEvent.click(screen.getByRole('checkbox'))

    expect(onChange).toHaveBeenCalled()
    expect(screen.getByRole('checkbox')).toBeChecked()
  })

  /**
   * The gauge is the whole point of the component: six call sites wrote `size-3` or `size-4`
   * beside the skin, neither of which followed the density setting. It comes from the class now,
   * and `daisy-gauge.test.ts` is what ties that class to `--size-selector`.
   */
  it('takes its gauge from the plugin rather than from the call', () => {
    render(<Checkbox aria-label="Amend" className="me-auto" />)

    expect(screen.getByRole('checkbox')).toHaveClass('checkbox', 'checkbox-sm', 'me-auto')
  })

  it('prefixes a bare handle, and writes none when it was given none', () => {
    const { rerender } = render(<Checkbox aria-label="Amend" data-sc="git.amend" />)
    expect(screen.getByRole('checkbox')).toHaveAttribute('data-sc', 'field:git.amend')

    rerender(<Checkbox aria-label="Amend" />)
    expect(screen.getByRole('checkbox')).not.toHaveAttribute('data-sc')
  })
})
