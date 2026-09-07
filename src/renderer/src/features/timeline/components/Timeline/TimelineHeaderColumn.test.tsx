import { act, fireEvent, render, screen, within, type RenderResult } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sequenceWith, trackFixture } from '@/engines/timeline/timeline-fixtures'
import { DEFAULT_TRACK_HEIGHT } from '@/engines/timeline/timelineState'
import { sequenceOf, useSequences } from '@/stores/sequences'
import { useTimelineView, viewportOf } from '@/stores/timelineView'
import { TrackHeaders } from '../Track/Headers/TrackHeaders'

/** Six rows in a column three high: the last three cannot be reached without the band moving. */
const ROWS = 6
const VISIBLE = 3 * DEFAULT_TRACK_HEIGHT
const CONTENT = ROWS * DEFAULT_TRACK_HEIGHT
const TOP = 1_000
const BOTTOM = TOP + VISIBLE

const frames = new Map<number, FrameRequestCallback>()
let queued = 0
let clock = 0

/**
 * Runs the frames queued so far, `ms` later.
 *
 * Hand-pumped rather than left to jsdom's own timer: the band's speed is written in pixels a
 * SECOND, so a test that cannot say how much time passed cannot say how far it should have gone.
 * Cancellation is honoured — a stub that ignores it would run the loop of a gesture that ended,
 * which is exactly what one of the cases below is about.
 */
const advance = (ms: number): void => {
  const due = [...frames.values()]
  frames.clear()
  clock += ms
  act(() => {
    for (const frame of due) frame(clock)
  })
}

/** The box the column clips with, and the stack inside it — neither of which jsdom measures. */
const layout = (view: RenderResult, content: number): void => {
  const clip = view.getByTestId('band-clip')
  const stack = clip.firstElementChild
  if (!(stack instanceof HTMLElement)) throw new Error('the clipping box holds no stack')

  Object.defineProperty(stack, 'offsetHeight', { configurable: true, value: content })
  Object.defineProperty(clip, 'clientHeight', { configurable: true, value: VISIBLE })
  clip.getBoundingClientRect = (): DOMRect => ({ top: TOP, bottom: BOTTOM }) as DOMRect
}

const scrollTop = (): number => viewportOf(useTimelineView.getState(), 'doc-1').scrollTop
const ids = (): string[] => sequenceOf(useSequences.getState(), 'doc-1').tracks.map(t => t.id)

const grab = (name: string, y: number): void => {
  fireEvent.pointerDown(screen.getByRole('button', { name: `Déplacer la piste ${name}` }), {
    clientY: y,
  })
}

beforeEach(() => {
  frames.clear()
  queued = 0
  clock = 0
  vi.stubGlobal('requestAnimationFrame', (frame: FrameRequestCallback) => {
    frames.set(++queued, frame)
    return queued
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))

  useTimelineView.setState({ viewports: {} })
  useSequences.setState({
    states: {
      'doc-1': sequenceWith(
        [...Array(ROWS).keys()].map(row => trackFixture(`A${row + 1}`, 'audio')),
      ),
    },
    histories: {},
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const held = (content = CONTENT): void => {
  const view = render(<TrackHeaders documentId="doc-1" />, { wrapper: StrictMode })
  layout(view, content)
  grab('A1', TOP + 10)
  fireEvent.pointerMove(window, { clientY: BOTTOM - 4, buttons: 1 })
  advance(0)
}

describe('a band that comes to the pointer', () => {
  /**
   * The whole reason this exists, measured on 15 August 2026: a panel docked at the foot of the
   * screen puts the fourth and fifth tracks of a montage past the bottom of the WINDOW. No
   * arithmetic in the gesture reaches them — the band has to come to the pointer.
   */
  it('travels while a row is held against its bottom edge', () => {
    held()

    advance(100)

    expect(scrollTop()).toBeGreaterThan(0)
  })

  it('stops where the stack ends, however long the row is held there', () => {
    held()

    for (let tick = 0; tick < 60; tick++) advance(100)

    expect(scrollTop()).toBe(CONTENT - VISIBLE)
  })

  // The pointer emits nothing while it is held still. Without the band's travel counting as
  // travel of its own, the stack would slide past a row that never changed rank.
  it('goes on placing the row while the band moves under a pointer that is still', () => {
    held()

    for (let tick = 0; tick < 60; tick++) advance(100)
    fireEvent.pointerUp(window)

    expect(ids().at(-1)).toBe('A1')
  })

  it('stands still once the row is dropped', () => {
    held()
    advance(100)
    const reached = scrollTop()

    fireEvent.pointerUp(window)
    advance(1_000)

    expect(scrollTop()).toBe(reached)
  })
})

describe('a timeline band at its boundaries', () => {
  /**
   * A release out THERE never reaches this window: no capture means no `pointerup`, and the
   * window keeps its focus so no `blur` either. Travelling on the last position seen would run
   * the stack to its end and carry the row through every rank of it, hand long since open.
   */
  it('stands still while the pointer is somewhere it cannot be heard from', () => {
    held()
    advance(100)
    const reached = scrollTop()

    fireEvent.pointerOut(window, { relatedTarget: null })
    for (let tick = 0; tick < 20; tick++) advance(100)

    expect(scrollTop()).toBe(reached)
    expect(ids().at(-1)).not.toBe('A1')
  })

  /**
   * The offset outlives the stack that justified it: no store bounds it, and the clamp lives in
   * whoever writes. Deleting tracks left the names translated off a band that now fits, with
   * nothing on this side able to bring them back.
   */
  it('brings a stale offset back within bounds on the first wheel', () => {
    const view = render(<TrackHeaders documentId="doc-1" />, { wrapper: StrictMode })
    layout(view, VISIBLE)
    useTimelineView.getState().set('doc-1', {
      ...viewportOf(useTimelineView.getState(), 'doc-1'),
      scrollTop: 3 * DEFAULT_TRACK_HEIGHT,
    })

    fireEvent.wheel(view.container.firstElementChild ?? view.container, { deltaY: 1 })

    expect(scrollTop()).toBe(0)
  })

  /**
   * The strip bounds its own horizontal travel against its width and the sequence's duration, and
   * anchors a zoom on the instant under the pointer. The names have neither: written from here,
   * a pan ran the montage off into the empty space `maxOffset` exists to refuse, and a zoom took
   * its anchor from a box that measures no time at all.
   */
  it('moves the stack and nothing else, whatever modifier the wheel carries', () => {
    const view = render(<TrackHeaders documentId="doc-1" />, { wrapper: StrictMode })
    layout(view, CONTENT)
    const column = view.container.firstElementChild ?? view.container
    const before = viewportOf(useTimelineView.getState(), 'doc-1')

    // Diagonal, as a trackpad sends it: the only shape where the stack moves AND the strip is
    // asked to move in the same event, so the only one that catches an offset written from here.
    fireEvent.wheel(column, { deltaX: 10_000, deltaY: DEFAULT_TRACK_HEIGHT })
    fireEvent.wheel(column, { deltaY: 10_000, shiftKey: true })
    fireEvent.wheel(column, { deltaY: -10_000, ctrlKey: true })

    const after = viewportOf(useTimelineView.getState(), 'doc-1')
    expect({ offset: after.offset, scale: after.scale }).toEqual({
      offset: before.offset,
      scale: before.scale,
    })
  })

  // Nothing to come to: a band whose whole stack is on screen must not creep when a row is
  // dragged over its edge, which would move the strip beside it for no reason at all.
  it('leaves a band alone when its whole stack is already on screen', () => {
    held(VISIBLE)

    advance(1_000)

    expect(scrollTop()).toBe(0)
  })

  // The way back, and the only place the lower bound is ever reached: a row carried to the top
  // edge has to bring the head of the stack with it, or the first ranks stay unreachable.
  it('travels the other way while a row is held against its top edge', () => {
    const view = render(<TrackHeaders documentId="doc-1" />, { wrapper: StrictMode })
    layout(view, CONTENT)
    useTimelineView.getState().set('doc-1', { ...viewportOf(useTimelineView.getState(), 'doc-1') })
    fireEvent.wheel(view.container.firstElementChild ?? view.container, { deltaY: 10_000 })
    expect(scrollTop()).toBe(CONTENT - VISIBLE)

    grab('A6', BOTTOM - 10)
    fireEvent.pointerMove(window, { clientY: TOP + 4, buttons: 1 })
    advance(0)
    for (let tick = 0; tick < 60; tick++) advance(100)

    expect(scrollTop()).toBe(0)
  })

  /**
   * Nothing said these lines belonged together: the column is a stack of bare divs, so a reader
   * met as many unnamed boxes as there are tracks, with no count to place any of them.
   *
   * Asked with the name, because a list that has none is announced by the bare word — the reason
   * `Collection` and `Tree` both require theirs.
   */
  it('reads as a named list holding one item per track', () => {
    render(<TrackHeaders documentId="doc-1" />, { wrapper: StrictMode })

    const list = screen.getByRole('list', { name: 'Pistes du montage' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(ROWS)
  })

  /**
   * Reading a stack meant carrying the pointer off the very rows one was reading: the strip has
   * always answered the wheel, the column of names never did.
   */
  it('answers the wheel over the names, and stops where the stack ends', () => {
    const view = render(<TrackHeaders documentId="doc-1" />, { wrapper: StrictMode })
    layout(view, CONTENT)
    const column = view.container.firstElementChild
    if (!column) throw new Error('the column no longer renders a box')

    fireEvent.wheel(column, { deltaY: DEFAULT_TRACK_HEIGHT })
    expect(scrollTop()).toBe(DEFAULT_TRACK_HEIGHT)

    fireEvent.wheel(column, { deltaY: 10_000 })
    expect(scrollTop()).toBe(CONTENT - VISIBLE)
  })
})
