import { describe, expect, it } from 'vitest'
import { MAX_SCALE as TIMELINE_MAX_SCALE } from '@/engines/timeline/viewport'
import {
  onDevicePixels,
  centerOn,
  clampCanvasScale,
  containIn,
  fitTo,
  CANVAS_MAX_SCALE,
  CANVAS_MIN_SCALE,
  nextZoom,
  previousZoom,
  wheelStep,
  toDocument,
  toScreen,
  visibleRect,
  zoomCanvasAt,
  type Viewport,
} from './viewport'

const VIEWPORT: Viewport = { x: 40, y: 20, scale: 2 }

describe('viewport', () => {
  it('maps a document point to the screen and back', () => {
    const screen = toScreen(VIEWPORT, { x: 10, y: 5 })

    expect(screen).toEqual({ x: 60, y: 30 })
    expect(toDocument(VIEWPORT, screen)).toEqual({ x: 10, y: 5 })
  })

  // A CSS pixel is not the unit that matters: at a ratio of 2, half a CSS pixel is whole.
  it('snaps the origin to whole device pixels and leaves the zoom alone', () => {
    expect(onDevicePixels({ x: 10.4, y: 3.5, scale: 8 }, 1)).toEqual({ x: 10, y: 4, scale: 8 })
    expect(onDevicePixels({ x: 10.4, y: 3.5, scale: 8 }, 2)).toEqual({ x: 10.5, y: 3.5, scale: 8 })
  })

  it('clamps a scale to what the renderer can show', () => {
    expect(clampCanvasScale(1000)).toBe(CANVAS_MAX_SCALE)
    expect(clampCanvasScale(0)).toBe(CANVAS_MIN_SCALE)
    expect(clampCanvasScale(Number.NaN)).toBe(1)
  })

  it('keeps the point under the anchor fixed while zooming', () => {
    const anchor = { x: 300, y: 180 }
    const before = toDocument(VIEWPORT, anchor)

    const zoomed = zoomCanvasAt(VIEWPORT, 8, anchor)

    expect(zoomed.scale).toBe(8)
    expect(toDocument(zoomed, anchor).x).toBeCloseTo(before.x)
    expect(toDocument(zoomed, anchor).y).toBeCloseTo(before.y)
  })

  it('fits a document inside the host with padding, centred', () => {
    const viewport = fitTo({ width: 1000, height: 500 }, { width: 548, height: 400 })

    expect(viewport.scale).toBeCloseTo(0.5)
    expect(viewport.x).toBe(24)
    expect(viewport.y).toBe(75)
  })

  // The ruler bands cover the top and left of the host: a document centred across the whole of
  // it would have its first rows under opaque chrome, unseen and unpaintable.
  it('leaves the chrome its corner when it is given an inset', () => {
    const viewport = fitTo({ width: 100, height: 100 }, { width: 500, height: 500 }, 20)

    expect(viewport).toEqual({ scale: 1, x: 210, y: 210 })
  })

  it('never magnifies a small document to fit', () => {
    expect(fitTo({ width: 10, height: 10 }, { width: 800, height: 600 }).scale).toBe(1)
  })

  it('centres at an explicit scale', () => {
    expect(centerOn({ width: 100, height: 100 }, { width: 300, height: 300 }, 1)).toEqual({
      scale: 1,
      x: 100,
      y: 100,
    })
  })

  it('walks the zoom stops in both directions', () => {
    expect(nextZoom(1)).toBe(1.5)
    expect(previousZoom(1)).toBe(0.6667)
    expect(nextZoom(CANVAS_MAX_SCALE)).toBe(CANVAS_MAX_SCALE)
    expect(previousZoom(CANVAS_MIN_SCALE)).toBe(CANVAS_MIN_SCALE)
  })

  it('does not stall on a stop it already sits on', () => {
    expect(nextZoom(0.9999999999)).toBe(1.5)
    expect(previousZoom(1.0000000001)).toBe(0.6667)
  })

  it('reports the document rectangle the host currently shows', () => {
    expect(visibleRect({ x: -100, y: -50, scale: 2 }, { width: 800, height: 600 })).toEqual({
      x: 50,
      y: 25,
      width: 400,
      height: 300,
    })
  })

  describe('laying a picture inside the document', () => {
    it('centres one that already fits, at its own size', () => {
      expect(containIn({ width: 400, height: 200 }, { width: 1024, height: 1024 })).toEqual({
        x: 312,
        y: 412,
        width: 400,
        height: 200,
      })
    })

    // Magnifying an import would blur it on arrival, with no way back to its own pixels.
    it('never magnifies a small one to fill the canvas', () => {
      const laid = containIn({ width: 10, height: 10 }, { width: 1024, height: 1024 })

      expect(laid.width).toBe(10)
    })

    it('shrinks one that overflows without deforming it', () => {
      const laid = containIn({ width: 4000, height: 2000 }, { width: 1000, height: 1000 })

      expect(laid).toEqual({ x: 0, y: 250, width: 1000, height: 500 })
    })
  })
})

/**
 * The canvas and the timeline each bound a scale, in two files of the SAME name, and their bounds
 * are four orders of magnitude apart: a canvas zooms between 0.02× and 64×, a timeline between a
 * millionth and two thousandths of a second per pixel. Both were once exported as `MIN_SCALE` and
 * `MAX_SCALE`, and both take and return a bare `number` — so an auto-import reaching the wrong
 * file compiled, and clamped a zoom to a unit it had never heard of.
 *
 * The names now say which. This reads BOTH sides on purpose: a claim about two ranges that only
 * ever measured one would be the costliest kind of comment — true-looking, and half-checked.
 */
describe("the canvas scale bounds, which are not the timeline's", () => {
  it('lets a canvas zoom out to a fiftieth and in to sixty-four times', () => {
    expect(CANVAS_MIN_SCALE).toBe(0.02)
    expect(CANVAS_MAX_SCALE).toBe(64)
  })

  // The other side, read from its own module: the day the two ranges meet, one of them was
  // imported by mistake or unified on purpose, and either way somebody must say so out loud.
  it('bounds nothing the timeline bounds', () => {
    expect(CANVAS_MIN_SCALE).toBeGreaterThan(TIMELINE_MAX_SCALE)
  })

  /*
   * The ladder ⌘+ and ⌘− walk is written as literals beside these constants, so it can drift from
   * them without a word. Asked through the walk rather than by exporting the array: what matters
   * is that the ends of the ladder ARE the bounds, not how the ladder is stored.
   */
  it('walks a ladder that ends exactly on its own bounds', () => {
    expect(previousZoom(0.03)).toBe(CANVAS_MIN_SCALE)
    expect(nextZoom(48)).toBe(CANVAS_MAX_SCALE)
  })

  /**
   * The pixel ladder has ends of its own, and they have to be reachable: one below the canvas
   * floor would be clamped to a scale that is not on the ladder, and the step back would jump.
   */
  it('holds the pixel ladder inside the same bounds', () => {
    expect(previousZoom(0.03125, true)).toBe(0.03125)
    expect(previousZoom(0.03125, true)).toBeGreaterThanOrEqual(CANVAS_MIN_SCALE)
    expect(nextZoom(48, true)).toBe(CANVAS_MAX_SCALE)
  })
})

describe('fitting a document', () => {
  const HOST = { width: 800, height: 800 }

  // ⌘0 on a 64² sprite gave a postage stamp: fitting refuses to magnify, which is right for a
  // photograph and makes the native pixel-art mode unusable.
  it('magnifies a sprite to a whole stop when asked, and never otherwise', () => {
    expect(fitTo({ width: 64, height: 64 }, HOST).scale).toBe(1)
    expect(fitTo({ width: 64, height: 64 }, HOST, 0, true).scale).toBe(8)
    // A large document worked in blocks lands under 1 either way: the lifted ceiling is
    // inoffensive there, which is what lets one rule serve both ways of working.
    expect(fitTo({ width: 1024, height: 1024 }, HOST, 0, true).scale).toBe(0.5)
  })
})

describe('the wheel on a pixel grid', () => {
  /**
   * Quantising the exponential result gives a dead wheel, so travel accumulates — and the
   * remainder is carried, or the rate follows how the browser chunked the gesture.
   */
  it('holds its stop until a notch of travel is worth one, and keeps what is left', () => {
    expect(wheelStep(8, 0, -20)).toEqual({ scale: 8, debt: -20 })
    expect(wheelStep(8, -20, -40)).toEqual({ scale: 12, debt: -10 })
  })

  it('spends every stop a coalesced burst paid for', () => {
    expect(wheelStep(1, 0, -150).scale).toBe(4)
  })

  it('drops travel that turned back, and ignores a sideways drift', () => {
    expect(wheelStep(8, -40, 20)).toEqual({ scale: 8, debt: 20 })
    expect(wheelStep(8, -40, 0)).toEqual({ scale: 8, debt: -40 })
  })

  /*
   * Retired rather than kept: `clampCanvasScale(1e-6) === CANVAS_MIN_SCALE` holds whatever that
   * constant is, so it survived the very mutation it was written against — measured, the harness
   * unified the bound to the timeline's and only the figures above went red. An assertion phrased
   * against the symbol it is testing proves the symbol equals itself.
   */
})
