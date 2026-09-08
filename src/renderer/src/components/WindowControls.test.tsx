import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { WindowInput } from './WindowInput'
import { WindowToggle } from './WindowToggle'

describe('window controls', () => {
  it('publishes the existing DaisyUI gauges through typed primitives', () => {
    render(
      <>
        <WindowInput aria-label="Name" />
        <WindowToggle aria-label="Enabled" />
      </>,
    )

    expect(screen.getByRole('textbox')).toHaveClass('input', 'input-sm')
    expect(screen.getByRole('checkbox')).toHaveClass('toggle', 'toggle-sm')
  })
})
