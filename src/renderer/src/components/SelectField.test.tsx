import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SelectField, type SelectOption } from './SelectField'

type Blend = 'normal' | 'multiply' | 'screen'

const BLENDS: readonly SelectOption<Blend>[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'multiply', label: 'Multiply' },
  { value: 'screen', label: 'Screen' },
]

function renderField(props: Partial<Parameters<typeof SelectField<Blend>>[0]> = {}) {
  const onChange = vi.fn()

  const { container } = render(
    <SelectField
      label="Blend mode"
      value="normal"
      options={BLENDS}
      onChange={onChange}
      {...props}
    />,
  )

  return { onChange, container, select: screen.getByRole('combobox') }
}

describe('SelectField', () => {
  it('offers every option it was given, under the value it holds', () => {
    const { select } = renderField({ value: 'multiply' })

    expect(select).toHaveValue('multiply')
    expect(screen.getAllByRole('option').map(option => option.textContent)).toEqual([
      'Normal',
      'Multiply',
      'Screen',
    ])
  })

  it('reports the value that was chosen', () => {
    const { onChange, select } = renderField()

    fireEvent.change(select, { target: { value: 'screen' } })

    expect(onChange).toHaveBeenCalledWith('screen')
  })

  /**
   * The whole reason this component exists: a `<select>` answers with a string, and twenty-one
   * sites each read it back into their own union — three of them differently. A value no option
   * carries must never reach the document.
   */
  it('drops a value no option answers to, rather than reporting it', () => {
    const { onChange, select } = renderField()

    fireEvent.change(select, { target: { value: 'overlay' } })

    expect(onChange).not.toHaveBeenCalled()
  })

  /**
   * The other half of the same problem, and the one that was missing: a value no option carries
   * cannot LEAVE the field, but until now nothing said what it showed while it was in hand —
   * the browser falls back to the first option, so the row read « Normal » over something else.
   */
  describe('a value none of the options names', () => {
    it('stands on a row of its own, which nobody may pick', () => {
      const { select } = renderField({ value: null, unnamedLabel: 'Custom' })

      expect(select).toHaveValue('')
      expect(screen.getByRole('option', { name: 'Custom' })).toBeDisabled()
    })

    it('leaves the named rows alone once a value names itself again', () => {
      renderField({ value: 'screen', unnamedLabel: 'Custom' })

      expect(screen.queryByRole('option', { name: 'Custom' })).not.toBeInTheDocument()
      expect(screen.getAllByRole('option')).toHaveLength(BLENDS.length)
    })
  })

  it('names itself by its visible label, with no second name over it', () => {
    renderField()

    expect(screen.getByLabelText('Blend mode')).toBeInTheDocument()
    expect(screen.getByRole('combobox')).not.toHaveAttribute('aria-label')
  })

  // `inline` draws no label column, so the name has nowhere to live but the attribute. `bar` is
  // the same on that point and differs only in skin — its own case is below.
  it('keeps a name when it draws no label column', () => {
    renderField({ layout: 'inline' })

    expect(screen.queryByText('Blend mode')).not.toBeInTheDocument()
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-label', 'Blend mode')
  })

  /**
   * It draws its own chevron, as `stacked` does — the browser pins the native one to the edge of
   * the control, where no padding reaches it — and reads quieter while nothing is chosen, which
   * is how a filter bar shows at a glance which of its facets are actually filtering.
   */
  describe('the filter-bar layout', () => {
    it('draws a chevron of its own, the native one being unreachable', () => {
      const { container } = render(
        <SelectField layout="bar" label="Type" value="" options={BLENDS} onChange={vi.fn()} />,
      )

      expect(container.querySelector('svg')).toBeInTheDocument()
      // `bg-none` is the plugin's own chevron being dropped: it draws it in the background.
      expect(screen.getByRole('combobox')).toHaveClass('bg-none')
    })

    // Read on the BOX, which is where `Select` takes its ink: the list is `text-inherit`, so a
    // colour written on the control itself would be the skin's `text-text` and never this one.
    it('reads quieter while nothing is chosen, and at full ink once something is', () => {
      const { rerender } = render(
        <SelectField layout="bar" label="Type" value="" options={BLENDS} onChange={vi.fn()} />,
      )
      expect(screen.getByRole('combobox').parentElement).toHaveClass('text-muted')

      rerender(
        <SelectField
          layout="bar"
          label="Type"
          value="multiply"
          options={BLENDS}
          onChange={vi.fn()}
        />,
      )
      expect(screen.getByRole('combobox').parentElement).not.toHaveClass('text-muted')
    })
  })

  it('wears the handle the MCP steers it by', () => {
    renderField({ scId: 'layer.blend' })

    expect(screen.getByRole('combobox')).toHaveAttribute('data-sc', 'field:layer.blend')
  })

  it('wears no handle when none was given, rather than an empty one', () => {
    renderField()

    expect(screen.getByRole('combobox')).not.toHaveAttribute('data-sc')
  })

  /**
   * The label BINDS the select rather than wrapping it, so what stands beside the control is not
   * swallowed by it: wrapped, pressing « add a rail » would open the list of rails next to it.
   */
  it('leaves what stands beside the select out of what the label names', () => {
    renderField({
      leading: <button type="button">Open</button>,
      actions: <button type="button">Add a rail</button>,
    })

    expect(screen.getByRole('button', { name: 'Open' }).closest('label')).toBeNull()
    expect(screen.getByRole('button', { name: 'Add a rail' }).closest('label')).toBeNull()
    // And the binding still holds, which is what makes the visible word the accessible name.
    expect(screen.getByLabelText('Blend mode')).toBe(screen.getByRole('combobox'))
  })
  /**
   * Runs in the caller's order, never a merge by name: a list whose headings are read off the
   * data can hand the same word twice, and sorting them would reorder what it offers.
   */
  it('draws a heading over each run of options that shares one', () => {
    renderField({
      options: [
        { value: 'normal', label: 'Normal', group: 'Here' },
        { value: 'multiply', label: 'Multiply', group: 'There' },
        { value: 'screen', label: 'Screen', group: 'Here' },
      ],
    })

    expect(screen.getAllByRole('group').map(one => one.getAttribute('label'))).toEqual([
      'Here',
      'There',
      'Here',
    ])
  })

  it('draws no heading at all for a list that names none', () => {
    renderField()

    expect(screen.queryAllByRole('group')).toEqual([])
  })
  /**
   * The end column belongs to the property LINE. Held on a stacked field, its room came out of
   * the select, which then stopped short of the fields standing under it.
   */
  it('holds no end column on a stacked field with nothing to put in it', () => {
    const { container } = renderField({ layout: 'stacked' })

    // The column is `FieldActions`' span; the chevron below is an svg and hides itself too.
    expect(container.querySelector('span[aria-hidden="true"]')).toBeNull()
  })

  /**
   * `stacked` drops the appearance and reserves room at its end exactly as `bar` does, but drew
   * nothing into it: the welcome's language field ended on an empty right edge.
   */
  it('draws its own chevron on a stacked field, the appearance being dropped', () => {
    const { container } = renderField({ layout: 'stacked' })

    expect(container.querySelector('svg')).toBeInTheDocument()
    expect(screen.getByRole('combobox')).toHaveClass('bg-none')
  })

  it('still draws what follows a stacked select', () => {
    renderField({ layout: 'stacked', actions: <button type="button">Add a rail</button> })

    expect(screen.getByRole('button', { name: 'Add a rail' })).toBeInTheDocument()
  })
})
