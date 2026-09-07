import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { TimelineRow } from './TimelineRow'
import type { RowReorder } from '../../rowReorder'

const ROW_HEIGHT = 40
const GRIP = /Move the row/

/**
 * Every render of this suite, as the window itself runs (`main.tsx`).
 *
 * A gesture whose effect cannot survive being replayed is exactly what this file guards — see
 * `helpers/teardown`. Rendered plainly, the whole suite is blind to that class of defect, and a
 * band above it (`TrackHeaders.test.tsx`) was left carrying the only proof.
 */
const strictly = { wrapper: StrictMode }

const rowWith = (reorder: Partial<RowReorder> & Pick<RowReorder, 'move'>) => (
  <TimelineRow height={ROW_HEIGHT} reorder={{ label: 'Move the row', ...reorder }}>
    <span>A1</span>
  </TimelineRow>
)

const grab = (): HTMLElement => {
  const grip = screen.getByRole('button', { name: GRIP })
  fireEvent.pointerDown(grip, { clientY: 0, pointerId: 1 })
  return grip
}

const dragTo = (clientY: number): void => {
  fireEvent.pointerMove(window, { clientY, pointerId: 1, buttons: 1 })
}

const drop = (): void => {
  fireEvent.pointerUp(window, { pointerId: 1 })
}

describe('TimelineRow', () => {
  it('moves the row by what the drag has travelled, and only by the difference', () => {
    const move = vi.fn((by: number) => by)
    render(rowWith({ move }), strictly)

    grab()
    dragTo(45)
    dragTo(85)

    // One place, then one more — never "one, then two", which would send the row twice as far
    // as the pointer went.
    expect(move.mock.calls).toEqual([[1], [1]])
  })

  // The gesture the defect was reported against: a rank up, then back down. The row moved once
  // and the drag went dead, because moving it is what released the capture the grip relied on.
  it('keeps following the pointer after the row has moved, in both directions', () => {
    const move = vi.fn((by: number) => by)
    render(rowWith({ move }), strictly)

    grab()
    dragTo(-45)
    dragTo(0)
    dragTo(45)

    expect(move.mock.calls).toEqual([[-1], [1], [1]])
  })

  it('leaves the row where it is while the pointer stays inside its own height', () => {
    const move = vi.fn((by: number) => by)
    render(rowWith({ move }), strictly)

    grab()
    dragTo(15)

    expect(move).not.toHaveBeenCalled()
  })

  // Held against the end of the stack, a drag banks nothing: the row would otherwise climb a
  // place it was never dragged over, the moment the pointer came back to where it started.
  it('counts what the stack gave, not what the pointer asked for', () => {
    const move = vi.fn(() => 0)
    render(rowWith({ move }), strictly)

    grab()
    dragTo(45)
    dragTo(0)

    expect(move.mock.calls).toEqual([[1]])
  })

  it('moves the row from the keyboard, so reordering is not a mouse-only gesture', async () => {
    const move = vi.fn((by: number) => by)
    render(rowWith({ move }), strictly)

    screen.getByRole('button', { name: GRIP }).focus()
    await userEvent.keyboard('{ArrowUp}{ArrowDown}')

    expect(move.mock.calls).toEqual([[-1], [1]])
  })

  // A drag across three places is one thing the user did, and has to cost one ⌘Z wherever the
  // order of the stack is an edit.
  it('opens one gesture for a whole drag, and closes it on release', () => {
    const begin = vi.fn()
    const end = vi.fn()
    render(rowWith({ move: (by: number) => by, begin, end }), strictly)

    grab()
    dragTo(45)
    dragTo(85)
    expect(end).not.toHaveBeenCalled()

    drop()
    expect(begin).toHaveBeenCalledTimes(1)
    expect(end).toHaveBeenCalledTimes(1)
  })

  // A touch cancelled by the system, a window that loses the pointer: the gesture has to close,
  // or the stack stays armed and the next move reorders something nobody is holding.
  it('closes the gesture when the pointer is cancelled', () => {
    const move = vi.fn((by: number) => by)
    const end = vi.fn()
    render(rowWith({ move, begin: () => undefined, end }), strictly)

    grab()
    fireEvent.pointerCancel(window, { pointerId: 1 })
    dragTo(85)

    expect(end).toHaveBeenCalledTimes(1)
    expect(move).not.toHaveBeenCalled()
  })

  /**
   * The release this window never hears: the button came up past its own edge, or while another
   * application had it. Nothing arrives at the time — the first move back inside is the whole
   * signal, and it is the one that has to end the gesture. Left open, the row stays dimmed and
   * armed for the rest of the session, and the next hover reorders a stack nobody is holding.
   */
  it('ends the gesture on the first move that carries no button', () => {
    const move = vi.fn((by: number) => by)
    const end = vi.fn()
    render(rowWith({ move, end }), strictly)
    const row = screen.getByText('A1').closest('div[style]')

    grab()
    fireEvent.pointerMove(window, { clientY: 200, pointerId: 1, buttons: 0 })

    expect(end).toHaveBeenCalledTimes(1)
    expect(move).not.toHaveBeenCalled()
    expect(row?.className).not.toContain('opacity-40')
  })

  // Torn down mid-gesture — a panel closed, a workspace left, a module swapped while the pointer
  // was down. The store would keep the gesture open, and every later edit would coalesce into it.
  it('closes the gesture when it is torn down mid-drag', () => {
    const end = vi.fn()
    const view = render(rowWith({ move: (by: number) => by, end }), strictly)

    grab()
    view.unmount()

    expect(end).toHaveBeenCalledTimes(1)
  })

  // A window that loses focus mid-drag never delivers the release at all.
  it('ends the gesture when the window loses focus', () => {
    const end = vi.fn()
    render(rowWith({ move: (by: number) => by, end }), strictly)
    const row = screen.getByText('A1').closest('div[style]')

    grab()
    fireEvent.blur(window)

    expect(end).toHaveBeenCalledTimes(1)
    expect(row?.className).not.toContain('opacity-40')
  })

  // Between two ranks the stack does not move, and nothing else would say a drag is under way.
  it('reads as held for the length of the gesture, and only for that', () => {
    render(rowWith({ move: (by: number) => by }), strictly)
    const row = screen.getByText('A1').closest('div[style]')

    grab()
    expect(row?.className).toContain('opacity-40')

    drop()
    expect(row?.className).not.toContain('opacity-40')
  })

  it('offers no grip to a row that holds no order of its own', () => {
    render(
      <TimelineRow height={ROW_HEIGHT} nested>
        <span>position</span>
      </TimelineRow>,
      strictly,
    )

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  /**
   * The column is one flat list: a channel is the sibling of its subject in the DOM, and only the
   * indentation says otherwise. A reader that is told nothing announces a subject and what hangs
   * off it as equals.
   */
  it('says which rows hang off the one above them, since the DOM does not', () => {
    render(
      <>
        {rowWith({ move: () => 0 })}
        <TimelineRow height={ROW_HEIGHT} nested level={2}>
          <span>position</span>
        </TimelineRow>
      </>,
      strictly,
    )

    const [subject, channel] = screen.getAllByRole('listitem')
    expect(subject).toHaveAttribute('aria-level', '1')
    expect(channel).toHaveAttribute('aria-level', '2')
  })

  /**
   * Indentation is not filiation, and the exposure sheet is where the two part: a clip row is
   * indented like a channel but stacked in its own run after every subject. Announced at rank 2
   * it would claim to hang off whichever subject came last.
   */
  it('leaves an indented row at the top rank until a caller says otherwise', () => {
    render(
      <TimelineRow height={ROW_HEIGHT} nested>
        <span>Walk</span>
      </TimelineRow>,
      strictly,
    )

    expect(screen.getByRole('listitem')).toHaveAttribute('aria-level', '1')
  })
})
