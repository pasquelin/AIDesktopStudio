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

  /** Two call sites wrote the same `FIELD` and the same three classes, word for word. */
  it('wears the plugin field, and leaves its height to the host', () => {
    render(<TextArea aria-label="Message" className="resize-y py-1 text-xs" />)

    expect(screen.getByRole('textbox')).toHaveClass('textarea', 'textarea-sm', 'resize-y')
  })
})
