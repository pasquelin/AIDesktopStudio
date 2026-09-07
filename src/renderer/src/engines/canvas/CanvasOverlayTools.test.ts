// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { cornersOfRect } from './handles'
import {
  ants,
  antPhase,
  drawOverlay,
  type OverlayContext,
  type OverlayScene,
  type ToolChrome,
} from './CanvasOverlay'
import { CanvasOverlay } from './CanvasOverlay'

type Call = { op: string; args: unknown[] }

/**
 * A context that writes down what it was asked to draw. jsdom has no 2D context, and the point
 * of the split is exactly this: the overlay's decisions can be read back without a GPU.
 */
function recorder(): { context: OverlayContext; calls: Call[] } {
  const calls: Call[] = []
  const record =
    (op: string) =>
    (...args: unknown[]): void => {
      calls.push({ op, args })
    }

  const style = { lineWidth: 0, lineDashOffset: 0, strokeStyle: '', fillStyle: '', font: '' }

  const context: OverlayContext = {
    save: record('save'),
    restore: record('restore'),
    setTransform: record('setTransform'),
    clearRect: record('clearRect'),
    beginPath: record('beginPath'),
    moveTo: record('moveTo'),
    lineTo: record('lineTo'),
    arc: record('arc'),
    stroke: record('stroke'),
    fill: record('fill'),
    fillRect: record('fillRect'),
    strokeRect: record('strokeRect'),
    fillText: record('fillText'),
    setLineDash: record('setLineDash'),
    textAlign: 'left',
    textBaseline: 'top',
    get lineWidth() {
      return style.lineWidth
    },
    set lineWidth(value: number) {
      style.lineWidth = value
      calls.push({ op: 'lineWidth', args: [value] })
    },
    // Recorded, since how far the ants have marched is the one thing that says they move at all.
    get lineDashOffset() {
      return style.lineDashOffset
    },
    set lineDashOffset(value: number) {
      style.lineDashOffset = value
      calls.push({ op: 'lineDashOffset', args: [value] })
    },
    get strokeStyle() {
      return style.strokeStyle
    },
    // Recorded like an operation: which colour a shape was drawn in is part of what the overlay
    // decided, and reading only the geometry lets a painter draw the right box in the wrong ink.
    set strokeStyle(value: string | CanvasGradient | CanvasPattern) {
      style.strokeStyle = String(value)
      calls.push({ op: 'strokeStyle', args: [String(value)] })
    },
    get fillStyle() {
      return style.fillStyle
    },
    set fillStyle(value: string | CanvasGradient | CanvasPattern) {
      style.fillStyle = String(value)
      calls.push({ op: 'fillStyle', args: [String(value)] })
    },
    get font() {
      return style.font
    },
    set font(value: string) {
      style.font = value
      calls.push({ op: 'font', args: [value] })
    },
  }

  return { context, calls }
}

const COLORS = {
  frame: '#frame',
  guide: '#guide',
  rulerBackground: '#bg',
  rulerText: '#text',
  rulerTick: '#tick',
  accent: '#accent',
  marqueeLight: '#light',
  marqueeDark: '#dark',
  gridCell: '#cell',
  gridPixel: '#pixel',
  scrim: '#scrim',
}

const NO_TOOL: ToolChrome = {
  crop: null,
  textBox: null,
  smartBox: null,
  overflowing: false,
  handles: null,
  lit: null,
  pending: null,
  selection: null,
  brushMark: null,
  commentDraft: null,
}

const RECT = { x: 10, y: 20, width: 30, height: 40 }

/**
 * Panned and zoomed on purpose: at 1:1 on the origin a document coordinate and a screen one are
 * the same number, and a painter that forgot to project would still read as correct.
 */
const VIEW = { x: 7, y: 11, scale: 2 }

function scene(overrides: Partial<OverlayScene> = {}): OverlayScene {
  return {
    viewport: { x: 0, y: 0, scale: 1 },
    host: { width: 400, height: 300 },
    document: { width: 100, height: 100 },
    showRulers: false,
    showGuides: true,
    showGrid: false,
    pixelCell: null,
    resolution: 1,
    guides: [],
    activeGuideId: null,
    pointer: null,
    colors: COLORS,
    rulerFont: '9px system-ui, sans-serif',
    language: 'en',
    marching: false,
    tools: NO_TOOL,
    ...overrides,
  }
}

/** The tool chrome alone: no rulers, no guides, and the frame is the first `strokeRect` of all. */
function toolScene(tools: Partial<ToolChrome>): OverlayScene {
  return scene({ showGuides: false, viewport: VIEW, tools: { ...NO_TOOL, ...tools } })
}

const opsOf = (calls: Call[], op: string): unknown[][] =>
  calls.filter(call => call.op === op).map(call => call.args)

describe('the marching ants', () => {
  it('strokes the same path twice, light under dark', () => {
    const { context, calls } = recorder()
    let traced = 0

    ants(context, () => (traced += 1), 0, COLORS)

    expect(traced).toBe(2)
    expect(opsOf(calls, 'stroke')).toHaveLength(2)
  })

  /**
   * A single dashed stroke vanishes against a background of its own colour, and the document
   * underneath can be any colour at all. The alternation is the whole mechanism.
   */
  it('dashes only the second stroke, leaving the first solid', () => {
    const { context, calls } = recorder()

    ants(context, () => undefined, 3, COLORS)

    const dashes = opsOf(calls, 'setLineDash')
    expect(dashes[0]).toEqual([[]])
    expect(dashes[1]).toEqual([[5, 4]])
  })

  it('offsets the dash by the phase, against the way the path was traced', () => {
    const { context, calls } = recorder()

    ants(context, () => undefined, 3, COLORS)

    expect(opsOf(calls, 'lineDashOffset')).toContainEqual([-3])
  })

  // Left as it was found: the ruler ticks and the frame are drawn by the same context after it.
  it('puts the dash and its offset back when it is done', () => {
    const { context, calls } = recorder()

    ants(context, () => undefined, 3, COLORS)

    expect(opsOf(calls, 'setLineDash').at(-1)).toEqual([[]])
    expect(opsOf(calls, 'lineDashOffset').at(-1)).toEqual([0])
  })

  /** From a clock, not a frame counter: the ants crawl at one speed whatever the frame rate. */
  it('walks one full pattern per period and starts over', () => {
    expect(antPhase(0)).toBe(0)
    expect(antPhase(250)).toBeCloseTo(4.5)
    expect(antPhase(500)).toBe(0)
  })

  it('reaches the same place a period later', () => {
    expect(antPhase(1700)).toBeCloseTo(antPhase(200))
  })
})

describe('the frame loop of the ants', () => {
  /**
   * The one thing that would keep a `requestAnimationFrame` alive for the life of a document if
   * it were wrong. Booking is decided from the scene, not from the canvas, so it can be read back
   * where jsdom hands out no 2D context at all.
   */
  function booksAfterOneFrame(marching: boolean): number {
    const frames: FrameRequestCallback[] = []
    const booked = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      frames.push(callback)
      return frames.length
    })

    const overlay = new CanvasOverlay(() => scene({ marching }))
    overlay.mount(document.createElement('div'))
    frames.shift()?.(0)
    const again = frames.length

    overlay.dispose()
    booked.mockRestore()
    return again
  }

  it('books the next step while something is dashed', () => {
    expect(booksAfterOneFrame(true)).toBe(1)
  })

  it('lets the loop die once nothing is', () => {
    expect(booksAfterOneFrame(false)).toBe(0)
  })
})

describe('the tool chrome', () => {
  it('draws nothing of its own when no tool holds anything', () => {
    const { context, calls } = recorder()
    drawOverlay(context, toolScene({}))

    // The document frame, and only it.
    expect(opsOf(calls, 'strokeRect')).toEqual([[7.5, 11.5, 200, 200]])
    expect(opsOf(calls, 'fillRect')).toEqual([])
    expect(opsOf(calls, 'stroke')).toEqual([])
  })

  it('shows the area while a generation comment is being traced', () => {
    const { context, calls } = recorder()
    drawOverlay(
      context,
      toolScene({
        commentDraft: [
          { x: 10, y: 20 },
          { x: 40, y: 60 },
        ],
      }),
    )

    expect(opsOf(calls, 'moveTo')).toEqual([[27, 51]])
    expect(opsOf(calls, 'lineTo')).toEqual([[87, 131]])
    expect(opsOf(calls, 'strokeStyle')).toEqual([['#frame'], ['#accent']])
  })

  /**
   * The one tool whose gesture shows nothing else: a caption is framed before a single glyph
   * exists, so an unpainted box leaves the person dragging blind.
   */
  it('marches the ants round the box a caption is being sized into', () => {
    const { context, calls } = recorder()
    drawOverlay(context, toolScene({ textBox: RECT }))

    expect(opsOf(calls, 'moveTo')).toEqual([
      [27.5, 51.5],
      [27.5, 51.5],
    ])
    expect(opsOf(calls, 'lineTo').slice(0, 4)).toEqual([
      [87.5, 51.5],
      [87.5, 131.5],
      [27.5, 131.5],
      [27.5, 51.5],
    ])
  })
  it('marches the ants round the intelligent selection box while it is being drawn', () => {
    const { context, calls } = recorder()
    drawOverlay(context, toolScene({ smartBox: RECT }))
    expect(opsOf(calls, 'moveTo')).toEqual([
      [27.5, 51.5],
      [27.5, 51.5],
    ])
    expect(opsOf(calls, 'lineTo').slice(0, 4)).toEqual([
      [87.5, 51.5],
      [87.5, 131.5],
      [27.5, 131.5],
      [27.5, 51.5],
    ])
  })
  it('closes the marquee back onto its first corner, in screen coordinates', () => {
    const { context, calls } = recorder()
    drawOverlay(context, toolScene({ selection: { kind: 'rect', rect: RECT } }))

    // Twice round: the ants stroke the same path a light pass then a dark dashed one.
    expect(opsOf(calls, 'moveTo')).toEqual([
      [27.5, 51.5],
      [27.5, 51.5],
    ])
    expect(opsOf(calls, 'lineTo').slice(0, 4)).toEqual([
      [87.5, 51.5],
      [87.5, 131.5],
      [27.5, 131.5],
      [27.5, 51.5],
    ])
    // The frame's own colour, then the two of the marquee: the right box in the wrong ink
    // reads as a bug, and a single-colour marquee vanishes over a document of that colour.
    expect(opsOf(calls, 'strokeStyle')).toEqual([['#frame'], ['#light'], ['#dark']])
  })
  it('dashes the second pass only, and puts the dash back for whoever draws next', () => {
    const { context, calls } = recorder()
    drawOverlay(context, toolScene({ selection: { kind: 'rect', rect: RECT } }))

    expect(opsOf(calls, 'setLineDash')).toEqual([[[]], [[]], [[5, 4]], [[]]])
  })

  it('leaves a lasso of no point alone', () => {
    const { context, calls } = recorder()
    drawOverlay(context, toolScene({ selection: { kind: 'lasso', points: [] } }))

    expect(opsOf(calls, 'stroke')).toEqual([])
    expect(opsOf(calls, 'setLineDash')).toEqual([[[]]])
  })

  /**
   * A marquee has to close, and a closed arrow draws its shaft twice — which is exactly what the
   * ants used to show. The path is the one the GPU is handed on release, so what the hand sees is
   * what lands.
   */
  it('draws the shape under the hand as it will land, open ends and all', () => {
    const { context, calls } = recorder()
    drawOverlay(
      context,
      toolScene({
        pending: {
          shape: { kind: 'line', from: { x: 10, y: 20 }, to: { x: 40, y: 60 } },
          fill: null,
          stroke: { color: '#ff0000', width: 4 },
        },
      }),
    )

    expect(opsOf(calls, 'moveTo')).toEqual([[27, 51]])
    expect(opsOf(calls, 'lineTo')).toEqual([[87, 131]])
    expect(opsOf(calls, 'strokeStyle')).toEqual([['#frame'], ['#ff0000']])
    expect(opsOf(calls, 'fill')).toEqual([])
  })

  it('fills the shapes that have an inside, in the colour the bar is holding', () => {
    const { context, calls } = recorder()
    drawOverlay(
      context,
      toolScene({
        pending: {
          shape: { kind: 'rectangle', x: 10, y: 20, width: 30, height: 40 },
          fill: '#00ff00',
          stroke: null,
        },
      }),
    )

    expect(opsOf(calls, 'fillStyle')).toContainEqual(['#00ff00'])
    expect(opsOf(calls, 'fill')).toEqual([[]])
    expect(opsOf(calls, 'stroke')).toEqual([])
  })

  it('lays the marquee down first, then the shape, then the crop over both', () => {
    const { context, calls } = recorder()
    drawOverlay(
      context,
      toolScene({
        selection: { kind: 'rect', rect: RECT },
        pending: {
          shape: { kind: 'line', from: { x: 50, y: 50 }, to: { x: 60, y: 70 } },
          fill: null,
          stroke: { color: '#ff0000', width: 2 },
        },
        crop: RECT,
      }),
    )

    const marquee = calls.findIndex(call => call.op === 'moveTo' && call.args[0] === 27.5)
    const shape = calls.findIndex(call => call.op === 'moveTo' && call.args[0] === 107)
    const scrim = calls.findIndex(call => call.op === 'fillRect')

    expect(marquee).toBeGreaterThanOrEqual(0)
    expect(shape).toBeGreaterThan(marquee)
    // The dimming comes last of the three, or it would fail to dim what it is about to cut.
    expect(scrim).toBeGreaterThan(shape)
  })

  /**
   * A paragraph hides what it cannot show, so something has to say the caption holds more. Both
   * Photoshop and InDesign cross that corner, and it is the only mark on screen that says it.
   */
  it('crosses the south-east grip while words are hidden below the box', () => {
    const { context, calls } = recorder()
    drawOverlay(context, toolScene({ handles: cornersOfRect(RECT), overflowing: true }))
    const crossed = calls.filter(call => call.op === 'moveTo').length

    const plain = recorder()
    drawOverlay(plain.context, toolScene({ handles: cornersOfRect(RECT), overflowing: false }))

    expect(crossed).toBeGreaterThan(plain.calls.filter(call => call.op === 'moveTo').length)
  })

  it('paints nothing at all for a shape with no vertex', () => {
    const { context, calls } = recorder()
    drawOverlay(
      context,
      toolScene({
        pending: { shape: { kind: 'polygon', points: [] }, fill: '#00ff00', stroke: null },
      }),
    )

    expect(opsOf(calls, 'fill')).toEqual([])
    expect(opsOf(calls, 'stroke')).toEqual([])
  })

  it('dims the four bands the crop would cut, then frames and grips what it keeps', () => {
    const { context, calls } = recorder()
    drawOverlay(context, toolScene({ crop: RECT }))

    const fills = opsOf(calls, 'fillRect')
    expect(fills.slice(0, 4)).toEqual([
      [7, 11, 200, 40],
      [7, 131, 200, 80],
      [7, 51, 20, 80],
      [87, 51, 120, 80],
    ])
    // Eight grips, not nine: a crop does not turn the document.
    expect(fills).toHaveLength(12)
    // The frame is traced rather than stroked as a rectangle: the ants stroke it twice.
    expect(opsOf(calls, 'moveTo')).toContainEqual([27.5, 51.5])
  })

  it('dims in the scrim colour and grips in the accent one', () => {
    const { context, calls } = recorder()
    drawOverlay(context, toolScene({ crop: RECT }))

    expect(opsOf(calls, 'fillStyle')).toEqual([['#scrim'], ['#accent']])
    // The frame wears the ants, like every other dashed outline in the space.
    expect(opsOf(calls, 'strokeStyle').at(-1)).toEqual(['#dark'])
  })

  // Eight, not nine: the rotation is a zone outside each corner now, and a square floating above
  // the box was indistinguishable from the eight that resize it.
  it('offers eight grips on the armed layer, and no ninth to turn it by', () => {
    const { context, calls } = recorder()
    drawOverlay(context, toolScene({ handles: cornersOfRect(RECT) }))

    const fills = opsOf(calls, 'fillRect')
    expect(fills).toHaveLength(8)
    // North-west corner: (10,20) projected, then backed off by half the grip size.
    expect(fills[0]).toEqual([23.5, 47.5, 8, 8])
    // Nothing sits above the box: every grip is on it.
    expect(fills.every(fill => Number(fill[1]) >= 47.5)).toBe(true)
  })

  // The outline says what is selected; eight squares with nothing between them only said where
  // the corners were.
  it('draws the outline of the box along with its grips', () => {
    const { context, calls } = recorder()
    drawOverlay(context, toolScene({ handles: cornersOfRect(RECT) }))

    expect(opsOf(calls, 'moveTo')).toContainEqual([27.5, 51.5])
  })

  it('lights the grip under the pointer, and only that one', () => {
    const { context, calls } = recorder()
    drawOverlay(context, toolScene({ handles: cornersOfRect(RECT), lit: 'nw' }))

    const fills = opsOf(calls, 'fillRect')
    expect(fills[0]).toEqual([22.5, 46.5, 10, 10])
    expect(fills[1]).toEqual([53.5, 47.5, 8, 8])
  })

  it('paints the crop before the grips, so the dimming never lands on top of one', () => {
    const { context, calls } = recorder()
    drawOverlay(context, toolScene({ crop: RECT, handles: cornersOfRect(RECT) }))

    const fills = opsOf(calls, 'fillRect')
    // Twelve for the crop — four bands and eight grips — then the layer's own eight.
    expect(fills).toHaveLength(20)
    expect(fills[0]).toEqual([7, 11, 200, 40])
  })
})
