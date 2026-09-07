import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SECOND } from '@shared/domain/time'
import { clipFixture, sequenceWith, trackFixture } from '@/engines/timeline/timeline-fixtures'
import { paintProgram } from '@/engines/timeline/programWave'
import type * as ProgramWave from '@/engines/timeline/programWave'
import { ProgramMonitor } from './ProgramMonitor'
import type { SoundTransport } from '@/hooks/useSoundTransport'

// The painter alone: `programViewport` and the palette stay real, being what the monitor's own
// geometry is measured against elsewhere in this file.
vi.mock('@/engines/timeline/programWave', async importOriginal => ({
  ...(await importOriginal<typeof ProgramWave>()),
  paintProgram: vi.fn(),
}))

/** Four seconds of sound on one track, so a click halfway across is two seconds in. */
const montage = () => sequenceWith([trackFixture('a', 'audio', [clipFixture('c', 0, 4 * SECOND)])])

const transport = (playing = false): SoundTransport => ({
  playing,
  toggle: vi.fn(),
  rewind: vi.fn(),
  tap: () => null,
})

/** The tab owns whether the take editor is on screen; the monitor only carries its button. */
const CLIP_HALF = { shown: false, onToggle: vi.fn() }

function show(overrides: { playing?: boolean; onSeek?: (time: number) => void } = {}) {
  const player = transport(overrides.playing)
  const onSeek = overrides.onSeek ?? vi.fn()
  render(
    <ProgramMonitor sequence={montage()} transport={player} onSeek={onSeek} clipHalf={CLIP_HALF} />,
  )
  return { player, onSeek }
}

/**
 * jsdom lays nothing out, so the canvas measures zero and `programViewport` would scale by zero.
 * The width is declared where the component reads it — off the bounding box, not off the element.
 *
 * The FIRST canvas: the meter stands beside the wave, and only the wave is scrubbed on.
 */
function wave(width = 400): HTMLElement {
  const canvas = document.querySelector('canvas')
  if (!canvas) throw new Error('the monitor drew no canvas')
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width, height: 100 }) as DOMRect
  return canvas
}

describe('ProgramMonitor', () => {
  it('hands both readings the transport it was given to listen on', () => {
    const pending: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(step => pending.push(step))
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})

    const heard = vi.fn(() => null)
    const player: SoundTransport = { ...transport(true), tap: heard }
    render(
      <ProgramMonitor
        sequence={montage()}
        transport={player}
        onSeek={vi.fn()}
        clipHalf={CLIP_HALF}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Spectre/ }))

    // One frame each: the meter's loop and the spectrum's, both listening where the montage plays.
    pending.splice(0).forEach(step => step(0))

    expect(heard).toHaveBeenCalledTimes(2)
    vi.restoreAllMocks()
  })

  /**
   * Ten minutes of music fitted to a panel is a green band with no shape in it. The wheel is the
   * one the strip and the dope sheet answer, so the gesture carries across surfaces.
   */
  it('zooms under the pointer, and says so by disarming the fit', () => {
    show()
    const canvas = wave()
    const fit = screen.getByRole('button', { name: /Tout le montage/ })

    expect(fit).toHaveAttribute('aria-pressed', 'true')

    fireEvent.wheel(canvas, { deltaY: -100, ctrlKey: true, clientX: 200 })

    expect(fit).toHaveAttribute('aria-pressed', 'false')
  })

  it('goes back to the whole montage when the fit is asked for', () => {
    show()
    fireEvent.wheel(wave(), { deltaY: -100, ctrlKey: true, clientX: 200 })
    const fit = screen.getByRole('button', { name: /Tout le montage/ })

    fireEvent.click(fit)

    expect(fit).toHaveAttribute('aria-pressed', 'true')
  })

  /**
   * A surface not laid out yet has no width, and a fit computed on none is a scale of zero: the
   * next scroll divides its delta by that and carries a NaN into the view, from which no gesture
   * ever comes back.
   */
  it('survives a wheel over a surface that has not been laid out', () => {
    const onSeek = vi.fn()
    show({ onSeek })

    fireEvent.wheel(wave(0), { deltaY: 100, clientX: 0 })
    fireEvent.pointerDown(wave(), { clientX: 200 })

    // A NaN carried into the view comes back out of every reading it ever feeds.
    expect(onSeek.mock.lastCall?.[0]).toBeGreaterThanOrEqual(0)
    expect(onSeek.mock.lastCall?.[0]).toBeLessThanOrEqual(4 * SECOND)
  })

  /** Fitted to the width there is nowhere to scroll to, so a plain wheel must change nothing. */
  it('stays fitted under a wheel that only scrolls', () => {
    show()

    fireEvent.wheel(wave(), { deltaY: 100, clientX: 200 })

    expect(screen.getByRole('button', { name: /Tout le montage/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  /**
   * One lane, so a plain wheel scrolls sideways. An ordinary mouse reports no `deltaX` at all:
   * sent to a vertical scroll this monitor does not have, its wheel moved nothing while
   * `preventDefault` kept the panel behind from moving either.
   */
  it('scrolls a zoomed montage under a plain vertical wheel', () => {
    const onSeek = vi.fn()
    show({ onSeek })
    fireEvent.wheel(wave(), { deltaY: -100, ctrlKey: true, clientX: 0 })
    fireEvent.pointerDown(wave(), { clientX: 0 })
    const before = onSeek.mock.lastCall?.[0] ?? 0

    fireEvent.wheel(wave(), { deltaY: 200, clientX: 0 })
    fireEvent.pointerDown(wave(), { clientX: 0 })

    expect(onSeek.mock.lastCall?.[0]).toBeGreaterThan(before)
  })

  /**
   * The curves are drawn inside the wave, so they cost no room — but they cross the very crests
   * one may be reading instead, and a reader who has no use for them can put them away.
   *
   * The palette is what is asserted, not only the button: `testSetup.ts` gives every canvas a
   * null context, so nothing under test ever reaches a painter — the one decision this component
   * makes about what is drawn would otherwise be held by nobody, in either direction.
   */
  it('takes the envelope out of the palette when the curves are put away', () => {
    const painted = vi.mocked(paintProgram)
    // `paintOn` fits the backing store before handing the context over, and the meter beside the
    // wave paints for real — so the stub has to answer what both of them touch.
    const context = { setTransform: vi.fn(), fillRect: vi.fn(), fillStyle: '' }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      context as unknown as CanvasRenderingContext2D & GPUCanvasContext,
    )
    show()
    const button = screen.getByRole('button', { name: /Courbes/ })

    expect(button).toHaveAttribute('aria-pressed', 'true')
    expect(painted.mock.lastCall?.[4]).toHaveProperty('envelope')

    fireEvent.click(button)

    expect(button).toHaveAttribute('aria-pressed', 'false')
    expect(painted.mock.lastCall?.[4]).not.toHaveProperty('envelope')
    vi.restoreAllMocks()
  })
})
