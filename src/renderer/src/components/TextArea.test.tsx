import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TextArea } from './TextArea'

describe('TextArea', () => {
  it('reports what is written in it', () => {
    const onChange = vi.fn()
    render(<TextArea aria-label="Message" onChange={onChange} />)

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Corrige la porte' } })

    expect(onChange).toHaveBeenCalled()
    expect(screen.getByRole('textbox')).toHaveValue('Corrige la porte')
  })

  /** The shape both panels asked for is the component's, which is why they wrote it twice. */
  it('carries the shape its two call sites used to spell out', () => {
    render(<TextArea aria-label="Message" />)

    expect(screen.getByRole('textbox')).toHaveClass('textarea', 'textarea-sm', 'resize-y', 'py-1')
  })
})
