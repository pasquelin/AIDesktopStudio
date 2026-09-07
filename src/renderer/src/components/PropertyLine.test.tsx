import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PropertyLine } from './PropertyLine'

describe('the shell every property line shares', () => {
  /**
   * The root is declared and never inferred: a bound `<label>` focuses what it names, so a field
   * one scrubs would end every drag in edit mode. Four fields say `div` for four distinct reasons.
   */
  it('wraps its control in a label only when it is asked to', () => {
    const { container } = render(
      <PropertyLine label="Rayon" root="label">
        <input aria-label="Rayon" />
      </PropertyLine>,
    )

    expect(container.querySelector('label')).not.toBeNull()
  })

  it('leaves the control unbound where binding would take the focus', () => {
    const { container } = render(
      <PropertyLine label="Position" root="div">
        <input aria-label="Position" />
      </PropertyLine>,
    )

    expect(container.querySelector('label')).toBeNull()
  })

  /**
   * The room at the end is kept whether it is drawn into or not: measured before it existed, a
   * field narrowed from 86 to 74 pixels UNDER the pointer, the reset appearing as the value moved.
   */
  it('keeps the end column even when nothing is drawn in it', () => {
    const { container } = render(
      <PropertyLine label="Rayon" root="div">
        <input aria-label="Rayon" />
      </PropertyLine>,
    )

    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull()
  })

  it('uses one control width when a row has only one action', () => {
    const { container } = render(
      <PropertyLine
        label="Texture"
        root="div"
        actions={<button type="button">Extract</button>}
        compactActions
      >
        <select aria-label="Texture" />
      </PropertyLine>,
    )

    expect(container.firstElementChild?.lastElementChild).toHaveClass('w-(--sc-control)')
  })

  /** A line that ends no property line — a vector's axis — asks for none rather than an empty one. */
  it('ends where it is told to end none', () => {
    const { container } = render(
      <PropertyLine label="X" root="div" name="none" actions={false}>
        <input aria-label="X" />
      </PropertyLine>,
    )

    expect(container.querySelector('[aria-hidden="true"]')).toBeNull()
    expect(screen.queryByTitle('X')).toBeNull()
  })

  /** The column truncates, so the whole name has to be reachable — the tooltip is where. */
  it('names its column so a truncated label can still be read', () => {
    render(
      <PropertyLine label="Segments radiaux" root="div">
        <input aria-label="Segments radiaux" />
      </PropertyLine>,
    )

    expect(screen.getByTitle('Segments radiaux')).toBeInTheDocument()
  })
})
