// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { cornersOfRect } from './handles'
import {
  drawOverlay,
  type OverlayContext,
  type OverlayScene,
  type ToolChrome,
} from './CanvasOverlay'

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

describe('the brush ring', () => {
  const AT = { x: 80, y: 60 }

  it('draws nothing while no painting tool is armed', () => {
    const { context, calls } = recorder()
    drawOverlay(context, scene({ pointer: AT, tools: { ...NO_TOOL, brushMark: null } }))

    expect(opsOf(calls, 'arc')).toHaveLength(0)
  })

  // The ring says where the next dab lands. With the hand off the canvas there is no next dab,
  // and a ring left at the last known point claims one.
  it('draws nothing once the pointer has left the canvas', () => {
    const { context, calls } = recorder()
    drawOverlay(context, scene({ pointer: null, tools: { ...NO_TOOL, brushMark: { radius: 12 } } }))

    expect(opsOf(calls, 'arc')).toHaveLength(0)
  })

  it('rings the pointer where it is, in screen pixels', () => {
    const { context, calls } = recorder()
    drawOverlay(context, scene({ pointer: AT, tools: { ...NO_TOOL, brushMark: { radius: 12 } } }))

    // The pointer is already in screen space — it is what the rulers echo — so it is not
    // projected a second time.
    expect(opsOf(calls, 'arc')[0]?.slice(0, 2)).toEqual([80, 60])
  })

  /**
   * The whole point of drawing it rather than using a CSS cursor: a 24 px brush covers 24
   * document pixels, which is half the screen at 1600% and a speck at 5%.
   */
  it('scales the radius with the zoom, so the ring covers what the dab will', () => {
    const { context, calls } = recorder()
    const zoomed = scene({
      viewport: VIEW,
      pointer: AT,
      tools: { ...NO_TOOL, brushMark: { radius: 12 } },
    })
    drawOverlay(context, zoomed)

    expect(opsOf(calls, 'arc')[0]?.[2]).toBe(24)
  })

  it('shrinks with the zoom just as honestly', () => {
    const { context, calls } = recorder()
    const far = scene({
      viewport: { x: 0, y: 0, scale: 0.25 },
      pointer: AT,
      tools: { ...NO_TOOL, brushMark: { radius: 12 } },
    })
    drawOverlay(context, far)

    expect(opsOf(calls, 'arc')[0]?.[2]).toBe(3)
  })

  // Same two-tone reasoning as the ants, and for the same reason: a single stroke vanishes
  // against a background of its own colour. Undashed, so it costs no frame loop.
  it('strokes twice, light under dark, and marches neither', () => {
    const { context, calls } = recorder()
    drawOverlay(context, scene({ pointer: AT, tools: { ...NO_TOOL, brushMark: { radius: 12 } } }))

    const inks = opsOf(calls, 'strokeStyle').map(args => args[0])
    expect(inks.slice(-2)).toEqual(['#light', '#dark'])
    expect(opsOf(calls, 'lineDashOffset')).toHaveLength(0)
  })

  it('rings above the grips, never under them', () => {
    const { context, calls } = recorder()
    const both = toolScene({ handles: cornersOfRect(RECT), brushMark: { radius: 12 } })
    drawOverlay(context, { ...both, pointer: AT })

    const arc = calls.findIndex(call => call.op === 'arc')
    const lastGrip = calls.map(call => call.op).lastIndexOf('fillRect')
    expect(arc).toBeGreaterThan(lastGrip)
  })
})
