import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Select } from './Select'

function renderSelect(className?: string) {
  const onChange = vi.fn()

  const { container } = render(
    <Select aria-label="Blend mode" defaultValue="normal" onChange={onChange} className={className}>
      <option value="normal">Normal</option>
      <option value="screen">Screen</option>
    </Select>,
  )

  return { onChange, container, select: screen.getByRole('combobox') }
}

describe('Select', () => {
  it('reports the value that was chosen', () => {
    const { onChange, select } = renderSelect()

    fireEvent.change(select, { target: { value: 'screen' } })

    expect(onChange).toHaveBeenCalled()
    expect(select).toHaveValue('screen')
  })

  it('draws the chevron the browser stops drawing, in the room the list reserves for it', () => {
    const { container, select } = renderSelect()

    expect(select.className).toContain('appearance-none')
    expect(select.className).toContain('pe-8')
    expect(container.querySelector('svg')).not.toBeNull()
  })

  /**
   * The half a caller gets wrong: a width on the LIST leaves the glyph beside the control, since
   * the chevron is pinned to the box. Everything a host sizes goes to the box, and the list fills
   * it — which is also how a window on another gauge sets a height the select obeys.
   */
  it('sizes the box rather than the list', () => {
    const { container, select } = renderSelect('w-full max-w-xs')

    expect(container.firstElementChild?.className).toContain('max-w-xs')
    expect(select.className).toContain('w-full')
    expect(select.className).not.toContain('max-w-xs')
  })
})
