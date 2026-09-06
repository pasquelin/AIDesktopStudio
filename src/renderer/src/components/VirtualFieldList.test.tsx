import { createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { VirtualFieldList } from './VirtualFieldList'

function fields(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `field-${index}`)
}

function show(count: number) {
  return render(
    <VirtualFieldList
      items={fields(count)}
      keyOf={item => item}
      label="Fields"
      renderItem={item => (
        <label>
          {item}
          <input aria-label={item} />
          <button type="button">Reset {item}</button>
        </label>
      )}
    />,
  )
}

function scrollWithEvents(element: HTMLElement): void {
  Object.defineProperty(element, 'scrollTo', {
    configurable: true,
    value: (first: number | ScrollToOptions, top?: number) => {
      element.scrollTop = typeof first === 'number' ? (top ?? 0) : (first.top ?? 0)
      fireEvent.scroll(element)
    },
  })
}

describe('VirtualFieldList', () => {
  it('keeps one hundred fields in the normal document flow', () => {
    const { container } = show(100)

    expect(screen.getAllByRole('textbox')).toHaveLength(100)
    expect(container.querySelector('[data-virtual-field-index]')).toBeNull()
    expect(screen.getByRole('group', { name: 'Fields' })).toHaveClass('flex', 'flex-col', 'gap-2')
  })

  it('mounts a window once the field count exceeds one hundred', () => {
    const { container } = show(101)

    expect(screen.getAllByRole('textbox').length).toBeLessThan(101)
    expect(container.querySelector('[data-virtual-field-index]')).toHaveClass('pb-2')
  })

  it('moves focus into the next field when Tab crosses the mounted window', async () => {
    const { container } = show(150)
    const group = screen.getByRole('group', { name: 'Fields' })
    scrollWithEvents(group)
    const rows = container.querySelectorAll<HTMLElement>('[data-virtual-field-index]')
    const last = rows.item(rows.length - 1)
    const index = Number(last.dataset.virtualFieldIndex)
    const reset = screen.getByRole('button', { name: `Reset field-${index}` })
    expect(screen.queryByLabelText(`field-${index + 1}`)).not.toBeInTheDocument()
    reset.focus()

    const tab = createEvent.keyDown(reset, { key: 'Tab' })
    fireEvent(reset, tab)

    expect(tab.defaultPrevented).toBe(true)
    expect(group.scrollTop).toBeGreaterThan(0)
    await waitFor(() => expect(screen.getByLabelText(`field-${index + 1}`)).toHaveFocus())
  })

  it('moves focus into the previous field when Shift Tab crosses the mounted window', async () => {
    const { container } = show(150)
    const group = screen.getByRole('group', { name: 'Fields' })
    scrollWithEvents(group)
    group.scrollTo({ top: 2_000 })
    await waitFor(() => expect(screen.queryByLabelText('field-0')).not.toBeInTheDocument())
    const rows = container.querySelectorAll<HTMLElement>('[data-virtual-field-index]')
    const first = rows.item(0)
    const index = Number(first.dataset.virtualFieldIndex)
    const input = screen.getByLabelText(`field-${index}`)
    expect(screen.queryByLabelText(`field-${index - 1}`)).not.toBeInTheDocument()
    input.focus()

    fireEvent.keyDown(input, { key: 'Tab', shiftKey: true })

    await waitFor(() =>
      expect(screen.getByRole('button', { name: `Reset field-${index - 1}` })).toHaveFocus(),
    )
  })

  it('mounts the last field after scrolling to it', async () => {
    show(150)
    const group = screen.getByRole('group', { name: 'Fields' })
    scrollWithEvents(group)

    group.scrollTo({ top: Number.MAX_SAFE_INTEGER })

    expect(await screen.findByLabelText('field-149')).toBeInTheDocument()
    expect(screen.queryByLabelText('field-0')).not.toBeInTheDocument()
  })

  it('starts from the first field when remounted', async () => {
    const first = show(150)
    const group = screen.getByRole('group', { name: 'Fields' })
    scrollWithEvents(group)
    group.scrollTo({ top: Number.MAX_SAFE_INTEGER })
    await screen.findByLabelText('field-149')
    first.unmount()

    show(150)

    expect(screen.getByLabelText('field-0')).toBeInTheDocument()
    expect(screen.queryByLabelText('field-149')).not.toBeInTheDocument()
  })
})
