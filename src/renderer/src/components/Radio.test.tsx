import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Radio } from './Radio'

describe('Radio', () => {
  it('reports the pick', () => {
    const onChange = vi.fn()
    render(<Radio aria-label="Image" onChange={onChange} />)

    fireEvent.click(screen.getByRole('radio'))

    expect(onChange).toHaveBeenCalled()
    expect(screen.getByRole('radio')).toBeChecked()
  })

  /** The gauge comes from the class; `daisy-gauge.test.ts` ties that class to `--sc-tick`. */
  it('takes its gauge from the plugin rather than from the call', () => {
    render(<Radio aria-label="Image" className="me-auto" />)

    expect(screen.getByRole('radio')).toHaveClass('radio', 'radio-sm', 'me-auto')
  })
})
