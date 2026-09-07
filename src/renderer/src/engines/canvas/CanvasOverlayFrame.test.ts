// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  drawOverlay,
  RULER_SIZE,
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

const opsOf = (calls: Call[], op: string): unknown[][] =>
  calls.filter(call => call.op === op).map(call => call.args)

describe('drawOverlay', () => {
  it('clears the whole host before drawing', () => {
    const { context, calls } = recorder()
    drawOverlay(context, scene())

    expect(calls[0]).toEqual({ op: 'clearRect', args: [0, 0, 400, 300] })
  })

  it('draws the document frame in screen coordinates', () => {
    const { context, calls } = recorder()
    drawOverlay(context, scene({ viewport: { x: 10, y: 20, scale: 2 } }))

    expect(opsOf(calls, 'strokeRect')).toEqual([[10.5, 20.5, 200, 200]])
  })

  // The whole reason the overlay is a second canvas: chrome does not scale with the document.
  it('keeps every stroke one pixel wide whatever the zoom', () => {
    for (const scale of [0.05, 1, 40]) {
      const { context, calls } = recorder()
      drawOverlay(context, scene({ viewport: { x: 0, y: 0, scale }, showRulers: true }))

      expect(opsOf(calls, 'lineWidth').flat()).toEqual([1])
    }
  })

  it('draws a vertical line for an x guide, across the whole host', () => {
    const { context, calls } = recorder()
    drawOverlay(
      context,
      scene({ guides: [{ id: 'g', axis: 'x', position: 40 }], viewport: { x: 5, y: 0, scale: 2 } }),
    )

    expect(opsOf(calls, 'moveTo')).toEqual([[85.5, 0]])
    expect(opsOf(calls, 'lineTo')).toEqual([[85.5, 300]])
  })

  const gridScene = (overrides: Partial<OverlayScene> = {}): OverlayScene =>
    scene({
      showGuides: false,
      showGrid: true,
      pixelCell: 8,
      document: { width: 16, height: 16 },
      viewport: { x: 0, y: 0, scale: 2 },
      ...overrides,
    })

  it('rules the document at its cell boundaries, bounded to the document', () => {
    const { context, calls } = recorder()
    drawOverlay(context, gridScene())

    // Cell 8 at scale 2 is 16 screen pixels apart; boundaries at 0, 8 and 16 document pixels.
    expect(opsOf(calls, 'moveTo')).toEqual([
      [0.5, 0],
      [16.5, 0],
      [32.5, 0],
      [0, 0.5],
      [0, 16.5],
      [0, 32.5],
    ])
    expect(opsOf(calls, 'lineTo')).toEqual([
      [0.5, 32],
      [16.5, 32],
      [32.5, 32],
      [32, 0.5],
      [32, 16.5],
      [32, 32.5],
    ])
  })

  /**
   * The finer level under the cell's, and its own ink: a grid drawn in one colour says nothing
   * about which lines are the artwork's pixels.
   */
  it('rules the document pixel under the cell, each in its own ink', () => {
    const { context, calls } = recorder()
    drawOverlay(context, gridScene({ pixelCell: 4, viewport: { x: 0, y: 0, scale: 8 } }))

    // The frame inks first, then the finer level, then the cell's over it.
    expect(opsOf(calls, 'strokeStyle').flat()).toEqual(['#frame', '#pixel', '#cell'])
    expect(opsOf(calls, 'stroke')).toHaveLength(2)
  })

  it('draws no grid under the threshold, nor off a pixel grid at all', () => {
    const coarse = recorder()
    drawOverlay(coarse.context, gridScene({ viewport: { x: 0, y: 0, scale: 0.5 } }))
    expect(opsOf(coarse.calls, 'moveTo')).toEqual([])

    const off = recorder()
    drawOverlay(off.context, gridScene({ pixelCell: null }))
    expect(opsOf(off.calls, 'moveTo')).toEqual([])
  })

  it('draws nothing for the guides once they are hidden', () => {
    const { context, calls } = recorder()
    drawOverlay(
      context,
      scene({ showGuides: false, guides: [{ id: 'g', axis: 'x', position: 40 }] }),
    )

    expect(opsOf(calls, 'moveTo')).toEqual([])
  })

  it('leaves both ruler bands out when they are off', () => {
    const { context, calls } = recorder()
    drawOverlay(context, scene())

    expect(opsOf(calls, 'fillRect')).toEqual([])
    expect(opsOf(calls, 'fillText')).toEqual([])
  })

  it('graduates with the font it was handed, never one written here', () => {
    const { context, calls } = recorder()
    drawOverlay(context, scene({ showRulers: true, rulerFont: '22px system-ui, sans-serif' }))

    expect(opsOf(calls, 'font').map(args => args[0])).toContain('22px system-ui, sans-serif')
  })

  it('graduates the top band in document units', () => {
    const { context, calls } = recorder()
    drawOverlay(context, scene({ showRulers: true, host: { width: 400, height: 60 } }))

    // 100% steps by 100, and the tick at 0 is hidden under the corner square.
    expect(opsOf(calls, 'fillText').map(args => args[0])).toContain('100')
    expect(opsOf(calls, 'fillText').map(args => args[0])).not.toContain('0')
  })

  /**
   * The one thing a graduation says, and it is said in the language the window is in — the same
   * reader has an inspector beside it writing `0,5`. Zoomed far enough in for the step to be
   * fractional, which is the only case where the separator shows.
   */
  it('graduates in the language the scene carries', () => {
    const { context, calls } = recorder()
    drawOverlay(
      context,
      scene({
        showRulers: true,
        host: { width: 400, height: 60 },
        viewport: { x: 0, y: 0, scale: 200 },
        language: 'fr',
      }),
    )

    const painted = opsOf(calls, 'fillText').map(args => String(args[0]))
    expect(painted.some(label => label.includes(','))).toBe(true)
    expect(painted.some(label => label.includes('.'))).toBe(false)
  })

  it('covers the corner where the two bands meet', () => {
    const { context, calls } = recorder()
    drawOverlay(context, scene({ showRulers: true }))

    expect(opsOf(calls, 'fillRect').at(-1)).toEqual([0, 0, RULER_SIZE, RULER_SIZE])
  })

  it('hands the tool its turn before the rulers cover it', () => {
    const { context, calls } = recorder()
    const tools = { ...NO_TOOL, selection: { kind: 'rect', rect: RECT } } satisfies ToolChrome

    drawOverlay(context, scene({ showRulers: true, showGuides: false, tools }))

    const painted = calls.findIndex(call => call.op === 'stroke')
    const band = calls.findIndex(call => call.op === 'fillRect')
    expect(painted).toBeGreaterThanOrEqual(0)
    expect(painted).toBeLessThan(band)
  })

  it('echoes the pointer on both rulers', () => {
    const { context, calls } = recorder()
    drawOverlay(context, scene({ showRulers: true, pointer: { x: 120, y: 90 } }))

    expect(opsOf(calls, 'moveTo')).toContainEqual([120.5, 0])
    expect(opsOf(calls, 'moveTo')).toContainEqual([0, 90.5])
  })
})
