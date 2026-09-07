import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { WindowInput } from './WindowInput'
import { WindowSelect } from './WindowSelect'
import { WindowToggle } from './WindowToggle'

describe('window controls', () => {
  it('publishes the existing DaisyUI gauges through typed primitives', () => {
    render(
      <>
        <WindowInput aria-label="Name" />
        <WindowSelect aria-label="Provider" />
        <WindowToggle aria-label="Enabled" />
      </>,
    )

    expect(screen.getByRole('textbox')).toHaveClass('input', 'input-sm')
    expect(screen.getByRole('combobox')).toHaveClass('select', 'select-sm')
    expect(screen.getByRole('checkbox')).toHaveClass('toggle', 'toggle-sm')
  })
})
