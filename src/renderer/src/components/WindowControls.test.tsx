import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { WindowInput } from './WindowInput'

describe('window controls', () => {
  it('publishes the existing DaisyUI gauges through typed primitives', () => {
    render(
      <>
        <WindowInput aria-label="Name" />
      </>,
    )

    expect(screen.getByRole('textbox')).toHaveClass('input', 'input-sm')
  })
})
