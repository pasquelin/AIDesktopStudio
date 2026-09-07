import { describe, expect, it } from 'vitest'
import {
  dragSelection,
  extendLasso,
  selectionBounds,
  selectionHolds,
  selectionOutline,
  type CanvasSelection,
} from './canvasSelection'

const SQUARE: CanvasSelection = { kind: 'rect', rect: { x: 10, y: 10, width: 100, height: 100 } }
const OVAL: CanvasSelection = { kind: 'ellipse', rect: { x: 0, y: 0, width: 100, height: 50 } }
/** A triangle, drawn by hand and left open — as every lasso is when the pointer comes up. */
const LASSO: CanvasSelection = {
  kind: 'lasso',
  points: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 0, y: 100 },
  ],
}
const RASTER: CanvasSelection = {
  kind: 'raster',
  bounds: { x: 10, y: 20, width: 2, height: 2 },
  width: 2,
  height: 2,
  alpha: new Uint8Array([255, 0, 0, 255]),
}

describe('making a selection', () => {
  it('draws a box between the two corners of a drag', () => {
    const made = dragSelection('rect', { x: 30, y: 20 }, { x: 10, y: 60 }, false)

    expect(made).toEqual({ kind: 'rect', rect: { x: 10, y: 20, width: 20, height: 40 } })
  })

  // Shift squares a rectangle and rounds an ellipse, as it does everywhere else.
  it('squares the box when the modifier is held', () => {
    const made = dragSelection('ellipse', { x: 0, y: 0 }, { x: 100, y: 20 }, true)

    expect(made).toMatchObject({ kind: 'ellipse', rect: { width: 100, height: 100 } })
  })

  it('grows a lasso a point at a time', () => {
    const started = dragSelection('lasso', { x: 0, y: 0 }, { x: 5, y: 5 }, false)
    const grown = extendLasso(started, { x: 9, y: 2 })

    expect(grown).toMatchObject({ kind: 'lasso', points: [{ x: 0 }, { x: 5 }, { x: 9 }] })
  })

  it('leaves anything that is not a lasso alone', () => {
    expect(extendLasso(SQUARE, { x: 1, y: 1 })).toBe(SQUARE)
  })
})

describe('the box a selection fits in', () => {
  it('is the rectangle itself for a box and an oval', () => {
    expect(selectionBounds(SQUARE)).toEqual({ x: 10, y: 10, width: 100, height: 100 })
    expect(selectionBounds(OVAL)).toEqual({ x: 0, y: 0, width: 100, height: 50 })
  })

  it('wraps every point of a lasso', () => {
    expect(selectionBounds(LASSO)).toEqual({ x: 0, y: 0, width: 100, height: 100 })
  })

  it('keeps the document bounds carried by a raster selection', () => {
    expect(selectionBounds(RASTER)).toEqual({ x: 10, y: 20, width: 2, height: 2 })
  })

  it('is nothing at all when nothing is selected', () => {
    expect(selectionBounds(null)).toBeNull()
  })
})

describe('the outline a selection shows', () => {
  it('traces opaque raster pixels instead of falling back to their bounding ellipse', () => {
    const raster: CanvasSelection = {
      kind: 'raster',
      bounds: { x: 10, y: 20, width: 3, height: 3 },
      width: 3,
      height: 3,
      alpha: new Uint8Array([255, 0, 0, 255, 0, 0, 255, 255, 255]),
    }

    expect(selectionOutline(raster)).toContainEqual({ x: 10, y: 21 })
    expect(selectionOutline(raster)).not.toContainEqual({ x: 13, y: 20 })
  })
})

describe('what a selection holds', () => {
  // No selection means the whole document, which is what makes the brush work by default.
  it('holds everything when there is none', () => {
    expect(selectionHolds(null, { x: -500, y: 9000 })).toBe(true)
  })

  it('holds what falls inside a box, and nothing outside it', () => {
    expect(selectionHolds(SQUARE, { x: 50, y: 50 })).toBe(true)
    expect(selectionHolds(SQUARE, { x: 5, y: 50 })).toBe(false)
  })

  // The corner of an oval's box is outside the oval: this is the whole difference between them.
  it('leaves the corners of its box out of an ellipse', () => {
    expect(selectionHolds(OVAL, { x: 50, y: 25 })).toBe(true)
    expect(selectionHolds(OVAL, { x: 1, y: 1 })).toBe(false)
  })

  it('closes a lasso on the fly rather than needing the hand to', () => {
    expect(selectionHolds(LASSO, { x: 10, y: 10 })).toBe(true)
    expect(selectionHolds(LASSO, { x: 90, y: 90 })).toBe(false)
  })

  it('holds only opaque pixels of a raster selection', () => {
    expect(selectionHolds(RASTER, { x: 10, y: 20 })).toBe(true)
    expect(selectionHolds(RASTER, { x: 11, y: 20 })).toBe(false)
    expect(selectionHolds(RASTER, { x: 11, y: 21 })).toBe(true)
    expect(selectionHolds(RASTER, { x: 12, y: 21 })).toBe(false)
  })

  it('holds nothing at all when a shape has no area', () => {
    const flat: CanvasSelection = { kind: 'ellipse', rect: { x: 0, y: 0, width: 0, height: 10 } }

    expect(selectionHolds(flat, { x: 0, y: 5 })).toBe(false)
  })
})
