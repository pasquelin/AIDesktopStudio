import { describe, expect, it, vi } from 'vitest'
import { paintTimeline } from './painter'
import type { Point } from '../core/geometry'
import { refreshPalette } from '../core/palette'
import {
  CLIP_INSET,
  EDGE_BAR_INSET,
  EDGE_BAR_WIDTH,
  FADE_BAND,
  RULER_HEIGHT,
  type Viewport,
} from './timelineGeometry'
import { clipFixture, sequenceWith, trackFixture } from './timeline-fixtures'
import {
  DEFAULT_TRACK_HEIGHT,
  EMPTY_SEQUENCE,
  type Clip,
  type SequenceState,
} from './timelineState'

const viewport: Viewport = { scale: 100 / 1_000_000, offset: 0, scrollTop: 0 }
const size = { width: 800, height: 200 }
const TRACK_HEIGHT = DEFAULT_TRACK_HEIGHT

const clip = clipFixture

const stateWith = (clips: Clip[]): SequenceState =>
  sequenceWith([trackFixture('V1', 'video', clips)])

/** The same, on a sound track: what a clip SHOWS follows the kind of track it sits on. */
const soundWith = (clips: Clip[]): SequenceState =>
  sequenceWith([trackFixture('A1', 'audio', clips)])

type Rect = { x: number; y: number; width: number; height: number }

/** Records what was painted, so the test asserts on rectangles and labels, not on pixels. */
function spyContext() {
  const rects: Rect[] = []
  const inks: string[] = []
  let ink = ''
  const texts: { text: string; x: number; y: number }[] = []
  const lines: Point[] = []
  const images: Rect[] = []

  const glyphs: { d: string; x: number; y: number; ink: string }[] = []
  let origin: Point = { x: 0, y: 0 }

  const context = {
    fillStyle: '',
    font: '',
    textBaseline: '',
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    translate: vi.fn((x: number, y: number) => void (origin = { x, y })),
    scale: vi.fn(),
    fill: vi.fn((path?: { d?: string }) => {
      if (path?.d) glyphs.push({ d: path.d, ...origin, ink })
    }),
    moveTo: vi.fn((x: number, y: number) => lines.push({ x, y })),
    lineTo: vi.fn((x: number, y: number) => lines.push({ x, y })),
    rect: vi.fn(),
    clip: vi.fn(),
    drawImage: vi.fn((_source: unknown, x: number, y: number, width: number, height: number) =>
      images.push({ x, y, width, height }),
    ),
    fillText: vi.fn((text: string, x: number, y: number) => texts.push({ text, x, y })),
    fillRect: vi.fn((x: number, y: number, width: number, height: number) => {
      rects.push({ x, y, width, height })
      inks.push(ink)
    }),
  }

  // The ink each rectangle was painted with, index for index with `rects`: `fillStyle` is
  // reassigned a dozen times per clip, and reading the property back shows only the last.
  Object.defineProperty(context, 'fillStyle', {
    get: () => ink,
    set: (value: string) => void (ink = value),
  })

  // Every assignment kept, not just the last: the painter sets one font for the ruler and
  // another for the clips, and reading the property back would only ever show the second.
  const fonts: string[] = []
  Object.defineProperty(context, 'font', {
    get: () => fonts.at(-1) ?? '',
    set: (value: string) => void fonts.push(value),
  })

  // jsdom has no usable 2D context; the painter only ever calls these members.
  return {
    context: context as unknown as CanvasRenderingContext2D,
    rects,
    inks,
    texts,
    lines,
    images,
    fonts,
    glyphs,
  }
}

describe('timeline painter', () => {
  it('paints a row for every track, so an empty timeline still reads as a timeline', () => {
    const { context, rects } = spyContext()
    paintTimeline(context, EMPTY_SEQUENCE, viewport, size)

    expect(rects).toContainEqual({ x: 0, y: RULER_HEIGHT, width: size.width, height: TRACK_HEIGHT })
    expect(rects).toContainEqual({
      x: 0,
      y: RULER_HEIGHT + TRACK_HEIGHT,
      width: size.width,
      height: TRACK_HEIGHT,
    })
  })

  it('gives each row the height its own track carries', () => {
    const { context, rects } = spyContext()
    const uneven = sequenceWith([
      trackFixture('V1', 'video', [], { height: 40 }),
      trackFixture('A1', 'audio', [], { height: 80 }),
    ])
    paintTimeline(context, uneven, viewport, size)

    expect(rects).toContainEqual({ x: 0, y: RULER_HEIGHT, width: size.width, height: 40 })
    expect(rects).toContainEqual({ x: 0, y: RULER_HEIGHT + 40, width: size.width, height: 80 })
  })

  it('labels a clip with what the caller calls it, not with its asset id', () => {
    const { context, texts } = spyContext()
    paintTimeline(context, stateWith([clip('a', 0, 1_000_000)]), viewport, size, {
      labelOf: () => 'Soft pad',
    })

    expect(texts.map(entry => entry.text)).toContain('Soft pad')
  })

  it('sizes what it paints from the ladder, so the text preference reaches the canvas', () => {
    document.documentElement.style.setProperty('--text-tiny', '22px')
    document.documentElement.style.setProperty('--text-mini', '20px')
    refreshPalette()

    // Restored even on a failed assertion: the palette is a module cache and the tokens are on
    // the shared root, so leaking either would fail the NEXT test and accuse the wrong code.
    try {
      const { context, fonts } = spyContext()
      paintTimeline(context, stateWith([clip('a', 0, 1_000_000)]), viewport, size)

      expect(fonts).toContain('22px ui-sans-serif, system-ui')
      expect(fonts).toContain('20px ui-monospace, monospace')
    } finally {
      document.documentElement.style.removeProperty('--text-tiny')
      document.documentElement.style.removeProperty('--text-mini')
      refreshPalette()
    }
  })

  it('keeps the shipped size when no token answers, rather than a shorthand with no size', () => {
    refreshPalette()

    const { context, fonts } = spyContext()
    paintTimeline(context, stateWith([clip('a', 0, 1_000_000)]), viewport, size)

    expect(fonts).toContain('11px ui-sans-serif, system-ui')
    expect(fonts).toContain('10px ui-monospace, monospace')
  })

  it('graduates the ruler in timecode', () => {
    const { context, texts } = spyContext()
    paintTimeline(context, EMPTY_SEQUENCE, viewport, size)

    expect(texts.map(entry => entry.text)).toContain('00:00:01:00')
  })

  it('paints a visible clip at its computed position', () => {
    const { context, rects } = spyContext()
    paintTimeline(context, stateWith([clip('a', 0, 1_000_000)]), viewport, size)

    expect(rects).toContainEqual({
      x: 0,
      y: RULER_HEIGHT + 2,
      width: 100,
      height: TRACK_HEIGHT - 5,
    })
  })

  it('labels a clip with the asset it plays', () => {
    const { context, texts } = spyContext()
    paintTimeline(context, stateWith([clip('a', 0, 1_000_000)]), viewport, size)

    expect(texts.map(entry => entry.text)).toContain('asset-a')
  })

  it('paints nothing for a clip entirely off screen', () => {
    const { context, rects } = spyContext()
    paintTimeline(context, stateWith([clip('a', 60_000_000, 1_000_000)]), viewport, size)

    expect(rects.some(rect => rect.width === 100)).toBe(false)
  })

  it('paints the playhead as a one-pixel column', () => {
    const { context, rects } = spyContext()
    paintTimeline(context, { ...stateWith([]), playhead: 2_000_000 }, viewport, size)

    expect(rects).toContainEqual({ x: 200, y: 0, width: 1, height: size.height })
  })

  it('clears before painting, so a scrub never leaves a trail', () => {
    const { context } = spyContext()
    paintTimeline(context, stateWith([]), viewport, size)

    expect(context.clearRect).toHaveBeenCalledWith(0, 0, size.width, size.height)
  })

  it('skips a track scrolled out of view', () => {
    const { context, rects } = spyContext()
    paintTimeline(
      context,
      stateWith([clip('a', 0, 1_000_000)]),
      { ...viewport, scrollTop: 1_000 },
      size,
    )

    expect(rects.some(rect => rect.width === 100)).toBe(false)
  })

  it('cuts a wedge out of each end of a clip that carries fades', () => {
    const { context, lines } = spyContext()
    const faded = { ...clip('a', 0, 1_000_000), fadeIn: 200_000, fadeOut: 200_000 }
    paintTimeline(context, stateWith([faded]), viewport, size)

    // The ramps end 20 px in and 20 px before the tail, at 100 px a second.
    expect(lines.map(point => point.x)).toEqual(expect.arrayContaining([20, 80]))
  })

  it('draws no wedge for a clip with no fades', () => {
    const { context, lines } = spyContext()
    paintTimeline(context, stateWith([clip('a', 0, 1_000_000)]), viewport, size)

    expect(lines).toHaveLength(0)
  })

  it('draws a waveform when the clip has peaks to draw', () => {
    const { context, lines } = spyContext()
    const peaks = new Float32Array([-1, 1, -0.5, 0.5])
    paintTimeline(context, soundWith([clip('a', 0, 1_000_000)]), viewport, size, {
      peaksOf: () => peaks,
    })

    expect(lines.length).toBeGreaterThan(0)
  })

  it('draws no waveform for a clip nothing was decoded for', () => {
    const { context, lines } = spyContext()
    paintTimeline(context, soundWith([clip('a', 0, 1_000_000)]), viewport, size, {
      peaksOf: () => null,
    })

    expect(lines).toHaveLength(0)
  })

  /**
   * What a track shows follows what it plays. Drawn on both, a waveform ran over the stills of
   * every rush — and the sound half of a linked take, which points at the SAME file, wore that
   * rush's frames underneath its own waveform. Two rows saying the same thing twice, badly.
   */
  it('keeps the waveform off a picture track, and the stills off a sound one', () => {
    const peaks = new Float32Array([-1, 1, -0.5, 0.5])
    // A stand-in: the painter only ever hands it to `drawImage`, which the spy records.
    const poster = {} as CanvasImageSource
    const both = { peaksOf: () => peaks, posterOf: () => poster }

    const picture = spyContext()
    paintTimeline(picture.context, stateWith([clip('a', 0, 1_000_000)]), viewport, size, both)

    const sound = spyContext()
    paintTimeline(sound.context, soundWith([clip('a', 0, 1_000_000)]), viewport, size, both)

    expect(picture.images).toHaveLength(1)
    expect(picture.lines).toHaveLength(0)
    expect(sound.lines.length).toBeGreaterThan(0)
    expect(sound.images).toHaveLength(0)
  })

  it('lays a poster across the head of a clip, never across the whole of it', () => {
    const { context, images } = spyContext()
    // A stand-in: the painter only ever hands it to `drawImage`, which the spy records.
    const poster = {} as CanvasImageSource
    paintTimeline(context, stateWith([clip('a', 0, 10_000_000)]), viewport, size, {
      posterOf: () => poster,
    })

    expect(images).toHaveLength(1)
    expect(images[0]?.width).toBeLessThan(1_000)
  })

  it('never lets a poster spill past a clip shorter than it', () => {
    const { context, images } = spyContext()
    // Same stand-in as above.
    const poster = {} as CanvasImageSource
    // 100 ms is 10 px wide, narrower than the poster would like to be.
    paintTimeline(context, stateWith([clip('a', 0, 100_000)]), viewport, size, {
      posterOf: () => poster,
    })

    expect(images[0]?.width).toBe(10)
  })

  it('marks both ends of a clip with a grip, which is what says it can be lengthened', () => {
    const { context, rects } = spyContext()
    paintTimeline(context, stateWith([clip('a', 0, 1_000_000)]), viewport, size)

    // 100 px wide, in a box inset by CLIP_INSET, the bar starting below the fade band.
    const boxHeight = TRACK_HEIGHT - CLIP_INSET * 2 - 1
    const bar = {
      y: RULER_HEIGHT + FADE_BAND,
      width: EDGE_BAR_WIDTH,
      height: boxHeight - (FADE_BAND - CLIP_INSET) - EDGE_BAR_INSET,
    }

    expect(rects).toContainEqual({ x: 0, ...bar })
    expect(rects).toContainEqual({ x: 100 - EDGE_BAR_WIDTH, ...bar })
  })

  /**
   * The defect this guards against is the whole point of the bar: inside the fade band the same
   * corner opens a fade, not a trim. A bar drawn up there is pressed for a lengthening and hands
   * back a ramp — and with `fadeIn` at zero nothing else is painted there to warn of it.
   */
  it('starts the bar below the fade band, where the corner is a trim and not a fade', () => {
    const { context, rects } = spyContext()
    paintTimeline(context, stateWith([clip('a', 0, 1_000_000)]), viewport, size)

    const bars = rects.filter(rect => rect.width === EDGE_BAR_WIDTH)
    expect(bars).toHaveLength(2)
    for (const bar of bars) {
      // The band is measured from the row's top, which is the ruler height on the first track.
      expect(bar.y).toBeGreaterThanOrEqual(RULER_HEIGHT + FADE_BAND)
      expect(bar.height).toBeGreaterThan(0)
    }
  })

  it('draws a grip after the border, which is what puts it outside the clipping path', () => {
    const { context, rects } = spyContext()
    paintTimeline(context, stateWith([clip('a', 0, 1_000_000)]), viewport, size)

    // The border is painted once the clip path is restored; anything before it can be masked
    // by a poster, and a grip nobody sees says nothing about the end of a clip.
    const border = rects.findIndex(rect => rect.x === 0 && rect.width === 1)
    const grip = rects.findIndex(rect => rect.x === 0 && rect.width === EDGE_BAR_WIDTH)

    expect(border).toBeGreaterThan(-1)
    expect(grip).toBeGreaterThan(border)
  })

  it('inks the grips of the selected clip like its label, and the rest like a hint', () => {
    document.documentElement.style.setProperty('--color-text', 'rgb(1, 2, 3)')
    document.documentElement.style.setProperty('--color-muted', 'rgb(4, 5, 6)')
    refreshPalette()

    // Restored even on a failed assertion, as above: the palette is a module cache.
    try {
      const gripInk = (painted: { rects: Rect[]; inks: string[] }): string | undefined =>
        painted.inks[painted.rects.findIndex(rect => rect.width === EDGE_BAR_WIDTH)]

      const one = clip('a', 0, 1_000_000)
      const chosen = spyContext()
      paintTimeline(chosen.context, { ...stateWith([one]), selectedId: 'a' }, viewport, size)

      const idle = spyContext()
      paintTimeline(idle.context, stateWith([one]), viewport, size)

      expect(gripInk(chosen)).toBe('rgb(1, 2, 3)')
      expect(gripInk(idle)).toBe('rgb(4, 5, 6)')
    } finally {
      document.documentElement.style.removeProperty('--color-text')
      document.documentElement.style.removeProperty('--color-muted')
      refreshPalette()
    }
  })

  it('leaves a clip too narrow to hold them unmarked, rather than covering it in grips', () => {
    const { context, rects } = spyContext()
    // 80 ms is 8 px wide: `edgeGrab` gives each edge under 3 px there, less than a grip needs.
    paintTimeline(context, stateWith([clip('a', 0, 80_000)]), viewport, size)

    expect(rects.filter(rect => rect.width === EDGE_BAR_WIDTH)).toHaveLength(0)
  })

  /**
   * Sentinel colours rather than the palette's own: what this holds is that the two kinds read
   * their own token. The greens themselves are measured in `design/tokens.test.ts`, against the
   * label and the waveform that have to stay legible on them.
   */
  it('fills a sound clip with its own colour, so a scrolled montage reads without labels', () => {
    document.documentElement.style.setProperty('--color-elevated', 'rgb(1, 2, 3)')
    document.documentElement.style.setProperty('--color-clip-audio', 'rgb(4, 5, 6)')
    refreshPalette()

    // Restored even on a failed assertion, as above: the palette is a module cache.
    try {
      const boxInk = (painted: { rects: Rect[]; inks: string[] }): string | undefined =>
        painted.inks[painted.rects.findIndex(rect => rect.width === 100)]

      const one = clip('a', 0, 1_000_000)
      const picture = spyContext()
      paintTimeline(picture.context, stateWith([one]), viewport, size)

      const sound = spyContext()
      paintTimeline(sound.context, soundWith([one]), viewport, size)

      expect(boxInk(picture)).toBe('rgb(1, 2, 3)')
      expect(boxInk(sound)).toBe('rgb(4, 5, 6)')
    } finally {
      document.documentElement.style.removeProperty('--color-elevated')
      document.documentElement.style.removeProperty('--color-clip-audio')
      refreshPalette()
    }
  })

  it('keeps a picked sound clip picked, rather than saying its kind twice', () => {
    document.documentElement.style.setProperty('--color-accent-soft', 'rgb(7, 8, 9)')
    document.documentElement.style.setProperty('--color-clip-audio', 'rgb(4, 5, 6)')
    refreshPalette()

    try {
      const one = clip('a', 0, 1_000_000)
      const { context, rects, inks } = spyContext()
      paintTimeline(context, { ...soundWith([one]), selectedId: 'a' }, viewport, size)

      expect(inks[rects.findIndex(rect => rect.width === 100)]).toBe('rgb(7, 8, 9)')
    } finally {
      document.documentElement.style.removeProperty('--color-accent-soft')
      document.documentElement.style.removeProperty('--color-clip-audio')
      refreshPalette()
    }
  })
})

describe('the mark saying a clip travels with its other half', () => {
  const paintOne = (one: Clip) => {
    const painted = spyContext()
    paintTimeline(painted.context, stateWith([one]), viewport, size)
    return painted.glyphs
  }

  /**
   * Both states are drawn, and that is what makes either readable: a mark shown only for a pair
   * that holds cannot be told from a mark nobody drew.
   */
  it('wears a different glyph for a pair that holds and for a clip standing alone', () => {
    const [tied] = paintOne(clip('a', 0, 1_000_000, { linkId: 'take-1' }))
    const [single] = paintOne(clip('a', 0, 1_000_000))

    expect(tied?.d).toBeTruthy()
    expect(single?.d).toBeTruthy()
    expect(tied?.d).not.toBe(single?.d)
  })

  it('inks a pair that holds like a label, and a clip standing alone like a hint', () => {
    document.documentElement.style.setProperty('--color-text', 'rgb(1, 2, 3)')
    document.documentElement.style.setProperty('--color-muted', 'rgb(4, 5, 6)')
    refreshPalette()

    try {
      expect(paintOne(clip('a', 0, 1_000_000, { linkId: 'take-1' }))[0]?.ink).toBe('rgb(1, 2, 3)')
      expect(paintOne(clip('a', 0, 1_000_000))[0]?.ink).toBe('rgb(4, 5, 6)')
    } finally {
      document.documentElement.style.removeProperty('--color-text')
      document.documentElement.style.removeProperty('--color-muted')
      refreshPalette()
    }
  })

  it('is left off a clip it would take whole', () => {
    // 200 ms is 20 px wide, under the three badge widths a corner mark asks of a clip.
    expect(paintOne(clip('a', 0, 200_000))).toHaveLength(0)
  })

  /**
   * A `linkId` is only ever laid on the two halves of a rush that has a picture AND a sound, so a
   * montage with no picture track can never hold one. The Audio workspace has none by
   * construction: every clip there wore the broken link forever, saying the same thing about all
   * of them — a mark that cannot vary is decoration, not a state.
   */
  it('is left off entirely where no pair could exist', () => {
    const painted = spyContext()
    paintTimeline(painted.context, soundWith([clip('a', 0, 1_000_000)]), viewport, size)

    expect(painted.glyphs).toHaveLength(0)
  })
})
