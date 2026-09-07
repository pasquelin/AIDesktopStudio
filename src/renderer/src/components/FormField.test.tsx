import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FormField } from './FormField'

describe('FormField', () => {
  it('puts the name above the control it lays out', () => {
    render(<FormField label="Graine" htmlFor="seed" control={<input id="seed" />} />)

    const field = screen.getByLabelText('Graine')

    // The name comes FIRST in the flow: a reader meets what the control is before the control.
    expect(field.previousElementSibling?.textContent).toBe('Graine')
  })

  /**
   * 🛑 Seen on screen: a checkbox drew as a lone square under its own name, with its help text
   * under THAT — three lines for one switch, and nothing said which square the name belonged to.
   */
  it('puts the name after the box when it sits beside it', () => {
    render(
      <FormField
        label="Quads"
        beside
        htmlFor="quads"
        control={<input id="quads" type="checkbox" />}
      />,
    )

    const box = screen.getByLabelText('Quads')

    expect(box.nextElementSibling?.textContent).toBe('Quads')
  })

  it('announces a required control as required', () => {
    render(<FormField label="Name" htmlFor="name" required control={<input id="name" />} />)
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-required', 'true')
  })
})
