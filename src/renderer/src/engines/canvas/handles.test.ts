import { describe, expect, it } from 'vitest'
import { IDENTITY, type Rect, type Transform } from './canvasState'
import type { Point } from '../core/geometry'
import {
  cornersOfRect,
  handleDirection,
  handlePoints,
  hitTest,
  layerBoxOf,
  layerCornersOf,
  outlinePoints,
  resizeBy,
  rotateBy,
  rotationCornerAt,
  unrotated,
  wholeOf,
  type HandleId,
} from './handles'

const BOX: Rect = { x: 100, y: 100, width: 200, height: 100 }

/** A square document, so a box and its scale read off each other without arithmetic. */
const DOC = { width: 1000, height: 1000 }

/** Deliberately not square: a width read where a height belongs is invisible on a square one. */
const WIDE = { width: 1000, height: 400 }

/** A quarter turn clockwise about the middle, which `IDENTITY` pins at the centre of the box. */
const TURNED: Transform = { ...IDENTITY, rotation: Math.PI / 2 }

/**
 * Not a multiple of a quarter turn, and pinned off-centre with an uneven scale. A quarter turn
 * annihilates every cosine term, and `origin: 0.5, scale: 1` makes the pivot and the middle of
 * the box the same point — between them they hide most of what can go wrong.
 */
const ASKEW: Transform = { ...IDENTITY, rotation: Math.PI / 6 }
const PINNED: Transform = { ...IDENTITY, rotation: Math.PI / 6, originX: 0, originY: 0, scaleX: 2 }

const DIRECTIONS: readonly [HandleId, number, number][] = [
  ['nw', -1, -1],
  ['n', 0, -1],
  ['e', 1, 0],
  ['se', 1, 1],
]

const pulled = (transform: Transform, handle: 'e' | 'se' | 'w' | 'n', to: Point, uniform = false) =>
  layerBoxOf(resizeBy(transform, handle, DOC, to, uniform), DOC)

describe('where the grips sit', () => {
  it('puts four on the corners and four on the middle of each edge', () => {
    const points = handlePoints(cornersOfRect(BOX))

    expect(points.nw).toEqual({ x: 100, y: 100 })
    expect(points.se).toEqual({ x: 300, y: 200 })
    expect(points.n).toEqual({ x: 200, y: 100 })
    expect(points.w).toEqual({ x: 100, y: 150 })
  })

  /**
   * The grips ride the shape actually on screen. They used to be derived from an axis-aligned
   * box, so a turned layer had its handles floating beside the picture they claimed to hold.
   */
  it('follows a turned layer round rather than staying square to the document', () => {
    const points = handlePoints(layerCornersOf(TURNED, DOC))

    expect(points.nw.x).toBeCloseTo(1000)
    expect(points.nw.y).toBeCloseTo(0)
    expect(points.e.x).toBeCloseTo(500)
    expect(points.e.y).toBeCloseTo(1000)
  })

  it('walks the outline in the order that draws it', () => {
    const outline = outlinePoints(cornersOfRect(BOX))

    expect(outline).toHaveLength(4)
    expect(outline[0]).toEqual({ x: 100, y: 100 })
    expect(outline[2]).toEqual({ x: 300, y: 200 })
  })
})

describe('the corners a layer occupies', () => {
  it('is the document itself at identity', () => {
    const corners = layerCornersOf(IDENTITY, DOC)

    expect(corners.nw).toEqual({ x: 0, y: 0 })
    expect(corners.se).toEqual({ x: 1000, y: 1000 })
  })

  it('turns about the middle the layer is pinned by', () => {
    const corners = layerCornersOf(TURNED, DOC)

    expect(corners.nw.x).toBeCloseTo(1000)
    expect(corners.sw.x).toBeCloseTo(0)
    expect(corners.sw.y).toBeCloseTo(0)
  })

  // On a square document a width read where a height belongs lands on the same number.
  it('tells the document’s two sides apart', () => {
    const corners = layerCornersOf(IDENTITY, WIDE)

    expect(corners.ne).toEqual({ x: 1000, y: 0 })
    expect(corners.sw).toEqual({ x: 0, y: 400 })
  })
})

describe('taking hold of the chrome', () => {
  it('finds the grip under the pointer', () => {
    expect(hitTest(cornersOfRect(BOX), { x: 302, y: 199 }, 6, 22)).toEqual({
      kind: 'handle',
      id: 'se',
    })
  })

  it('finds nothing in the middle of the box', () => {
    expect(hitTest(cornersOfRect(BOX), { x: 200, y: 150 }, 6, 22)).toBeNull()
  })

  it('finds nothing beyond either reach', () => {
    expect(hitTest(cornersOfRect(BOX), { x: 340, y: 240 }, 6, 22)).toBeNull()
  })

  // The grip is where the eye sees it on a turned layer, which is the whole point of corners.
  it('finds a grip on a turned layer where the picture actually has its corner', () => {
    expect(hitTest(layerCornersOf(TURNED, DOC), { x: 1000, y: 1000 }, 6, 22)).toEqual({
      kind: 'handle',
      id: 'ne',
    })
  })

  /**
   * One test rather than one per gesture: the press and the cursor both ask this, and a grip
   * that lit up without answering the press is the failure the single answer exists to prevent.
   */
  it('prefers the grip to the rotation ring where the two zones meet', () => {
    expect(hitTest(cornersOfRect(BOX), { x: 302, y: 202 }, 6, 22)).toEqual({
      kind: 'handle',
      id: 'se',
    })
  })

  it('offers the ring just past the grip', () => {
    expect(hitTest(cornersOfRect(BOX), { x: 308, y: 208 }, 6, 22)).toEqual({
      kind: 'rotate',
      id: 'se',
    })
  })

  // A crop frame does not turn, and says so by having no reach at all rather than by a branch.
  it('offers no rotation at all when the reach is zero', () => {
    expect(hitTest(cornersOfRect(BOX), { x: 308, y: 208 }, 6, 0)).toBeNull()
  })
})

describe('which way a grip pulls', () => {
  // Read off `ANCHOR`, so the two can never disagree about which corner is opposite which.
  it.each(DIRECTIONS)('sends %s away from the corner it anchors against', (handle, x, y) => {
    expect(handleDirection(handle)).toEqual({ x, y })
  })
})

describe('the rotation zone outside a corner', () => {
  it('takes a point just beyond a corner', () => {
    expect(rotationCornerAt(cornersOfRect(BOX), { x: 308, y: 208 }, 22)).toBe('se')
  })

  // Inside is where a drag moves the layer: only the outside of a corner turns it.
  it('takes nothing just inside the same corner', () => {
    expect(rotationCornerAt(cornersOfRect(BOX), { x: 292, y: 192 }, 22)).toBeNull()
  })

  it('takes nothing further out than its reach', () => {
    expect(rotationCornerAt(cornersOfRect(BOX), { x: 340, y: 240 }, 22)).toBeNull()
  })

  it('follows a turned layer, since the edges it measures against turn with it', () => {
    const corners = layerCornersOf(TURNED, DOC)

    expect(rotationCornerAt(corners, { x: 1008, y: -8 }, 22)).toBe('nw')
  })

  /**
   * A flat box is where measuring against the middle of the box instead of against its edges
   * falls apart: the circumscribed circle's tangent runs almost vertical at the corner, so the
   * quadrant tips over and follows the diagonal rather than the corner. Each corner owns the
   * same quarter whatever the box's proportions.
   */
  it('offers the same quarter on a flat box as on a square one', () => {
    const flat = cornersOfRect({ x: 0, y: 0, width: 1000, height: 100 })

    expect(rotationCornerAt(flat, { x: -5, y: -10 }, 22)).toBe('nw')
  })

  // Straight above an edge is neither in nor out of a corner: it is where a drag moves the layer.
  it('offers nothing straight above an edge, however near a corner', () => {
    const flat = cornersOfRect({ x: 0, y: 0, width: 1000, height: 100 })

    expect(rotationCornerAt(flat, { x: 5, y: -10 }, 22)).toBeNull()
  })

  // Each corner owns its own quadrant, so the one actually aimed at is the one returned.
  it('names the corner the pointer is beyond, not the first of the four', () => {
    const small = cornersOfRect({ x: 0, y: 0, width: 20, height: 20 })

    expect(rotationCornerAt(small, { x: 25, y: 25 }, 40)).toBe('se')
    expect(rotationCornerAt(small, { x: -5, y: 25 }, 40)).toBe('sw')
  })
})

describe('bringing a point back into the un-turned box', () => {
  it('leaves a point alone when the layer was never turned', () => {
    expect(unrotated(IDENTITY, DOC, { x: 42, y: 7 })).toEqual({ x: 42, y: 7 })
  })

  it('undoes the quarter turn a layer was given', () => {
    const straight = unrotated(TURNED, DOC, { x: 500, y: 1000 })

    expect(straight.x).toBeCloseTo(1000)
    expect(straight.y).toBeCloseTo(500)
  })
})

describe('where a layer stands, ignoring its rotation', () => {
  // The origin is where the layer is pinned, and `place` scales about it: the box grows from
  // that point, not from the top-left corner.
  it('grows about the origin the layer is pinned by', () => {
    const doubled = { ...IDENTITY, scaleX: 2, scaleY: 2 }

    expect(layerBoxOf(doubled, DOC)).toEqual({ x: -500, y: -500, width: 2000, height: 2000 })
  })

  it('is the document itself at identity', () => {
    expect(layerBoxOf(IDENTITY, DOC)).toEqual({ x: 0, y: 0, width: 1000, height: 1000 })
  })

  it('follows the layer where it was moved', () => {
    expect(layerBoxOf({ ...IDENTITY, x: 40 }, DOC)).toMatchObject({ x: 40 })
  })
})

describe('pulling a grip', () => {
  it('doubles the width when the east grip is pulled twice as far', () => {
    expect(pulled(IDENTITY, 'e', { x: 2000, y: 500 })).toMatchObject({ width: 2000 })
  })

  /**
   * The whole point of a grip: the edge you are pulling against does not move. It used to drift
   * by the origin term, so a layer slid out from under the pointer as it was resized.
   */
  it('leaves the anchored edge exactly where it was', () => {
    const box = pulled(IDENTITY, 'e', { x: 2000, y: 500 })

    expect(box.x).toBe(0)
  })

  it('anchors the east edge when the west grip is pulled', () => {
    const box = pulled(IDENTITY, 'w', { x: -1000, y: 500 })

    expect(box.x + box.width).toBe(1000)
    expect(box.width).toBe(2000)
  })

  it('holds the anchor on a layer that was already moved and scaled', () => {
    const placed = { ...IDENTITY, x: 120, scaleX: 1.5, scaleY: 1.5 }
    const before = layerBoxOf(placed, DOC)
    const after = pulled(placed, 'e', { x: 900, y: 400 })

    expect(after.x).toBeCloseTo(before.x)
  })

  it('leaves the other axis alone for a grip on an edge', () => {
    expect(resizeBy(IDENTITY, 'e', DOC, { x: 2000, y: 9000 }, false).scaleY).toBe(1)
  })

  // The north grip anchors the south edge, which is the vertical mirror of the west grip's case.
  it('anchors the south edge when the north grip is pulled', () => {
    const box = layerBoxOf(resizeBy(IDENTITY, 'n', DOC, { x: 500, y: -1000 }, false), DOC)

    expect(box.y + box.height).toBe(1000)
    expect(box.height).toBe(2000)
  })

  it('pulls both axes from a corner', () => {
    const box = pulled(IDENTITY, 'se', { x: 2000, y: 2000 })

    expect(box).toMatchObject({ width: 2000, height: 2000 })
  })

  // Shift keeps a picture's shape, as it does everywhere else in the studio.
  it('follows the longer side on both axes when the modifier is held', () => {
    const after = resizeBy(IDENTITY, 'se', DOC, { x: 2000, y: 1100 }, true)

    expect(after.scaleX).toBe(after.scaleY)
  })

  /**
   * On the result, not on one gesture's step: the steps multiply, so three collapsing drags of a
   * bounded ratio still reached a millionth — a layer with no box left to grab.
   */
  it('never scales a layer down to nothing, however many times it is collapsed', () => {
    let transform = IDENTITY
    for (let drag = 0; drag < 3; drag += 1) {
      transform = resizeBy(transform, 'e', DOC, { x: 0, y: 500 }, false)
    }

    expect(Math.abs(transform.scaleX)).toBeGreaterThanOrEqual(0.01)
  })
})

describe('pulling a transformed grip', () => {
  /**
   * On a turned layer the east grip is on screen where the eye sees the east edge — below the
   * middle, after a quarter turn. Dragging it away from the box has to widen the layer along its
   * own axis, not read the movement against the document's.
   */
  it('widens a turned layer along its own edge, not the document’s', () => {
    const after = resizeBy(TURNED, 'e', DOC, { x: 500, y: 2000 }, false)

    expect(after.scaleX).toBeCloseTo(2)
    expect(after.scaleY).toBeCloseTo(1)
  })

  /**
   * The scale being right is only half of it. `x` and `y` carry the point the rotation is applied
   * about, so re-anchoring inside the un-turned box moves that point too and the whole layer
   * swings — 707 px at a quarter turn, which is the anchored edge leaving the screen.
   *
   * Asserted on the corner as it is actually drawn, which is the only place the error shows.
   */
  const anchoredCorner = (transform: Transform, doc: typeof DOC) => layerCornersOf(transform, doc)

  it('leaves the anchored edge of a turned layer exactly where it was drawn', () => {
    const before = anchoredCorner(TURNED, DOC)
    const after = anchoredCorner(resizeBy(TURNED, 'e', DOC, { x: 500, y: 2000 }, false), DOC)

    // The east grip pulls against the west edge: both of its corners have to stay put.
    expect(after.nw.x).toBeCloseTo(before.nw.x)
    expect(after.nw.y).toBeCloseTo(before.nw.y)
    expect(after.sw.x).toBeCloseTo(before.sw.x)
    expect(after.sw.y).toBeCloseTo(before.sw.y)
  })

  // Thirty degrees keeps every cosine term alive, where a quarter turn annihilates them.
  it('holds the anchor at an angle that is not a quarter turn', () => {
    const before = anchoredCorner(ASKEW, DOC)
    const after = anchoredCorner(resizeBy(ASKEW, 'se', DOC, { x: 1800, y: 1800 }, false), DOC)

    expect(after.nw.x).toBeCloseTo(before.nw.x)
    expect(after.nw.y).toBeCloseTo(before.nw.y)
  })

  /**
   * Pinned at its top-left with an uneven scale: the pivot and the middle of the box are then two
   * different points, which is what tells a correct de-rotation from one that guessed the centre.
   */
  it('holds the anchor on a layer pinned off-centre', () => {
    const before = anchoredCorner(PINNED, WIDE)
    const after = anchoredCorner(resizeBy(PINNED, 'e', WIDE, { x: 900, y: 700 }, false), WIDE)

    expect(after.nw.x).toBeCloseTo(before.nw.x)
    expect(after.nw.y).toBeCloseTo(before.nw.y)
  })

  // A box already collapsed onto a line has no extent to divide by: the scale it holds is kept
  // rather than turned into a NaN nothing can undo.
  it('keeps the scale of a layer that has no width left to pull against', () => {
    const flat = { ...IDENTITY, scaleX: 0 }

    expect(resizeBy(flat, 'e', DOC, { x: 500, y: 500 }, false).scaleX).not.toBeNaN()
  })

  /**
   * A uniform pull that flips one axis and lands exactly on the anchor on the other: the axis
   * that moved nothing has no sign of its own, and taking it from zero would collapse the layer
   * to the floor scale instead of sizing it. Asserted on the value, not on the two signs agreeing
   * — they agree either way, which is what let the wrong answer through.
   */
  it('sizes the axis that landed on its anchor rather than collapsing it', () => {
    const after = resizeBy(IDENTITY, 'se', DOC, { x: 0, y: -1000 }, true)

    expect(after.scaleX).toBe(1)
    expect(after.scaleY).toBe(-1)
  })
})

/**
 * A picture laid by `containIn` does not fill its surface: shrunk to fit and centred, it leaves
 * transparent margin on two sides. Gripping that margin is gripping nothing, so the grips take
 * the picture — which is what every other editor frames for a picture layer.
 *
 * The frame is a rect INSIDE the document, in document coordinates, and it has to travel through
 * all three: the corners that are drawn, the box the drag is solved in, and the corner the pull
 * is anchored against. Drawn on one and solved on another, a grip scales from the wrong point.
 */
describe('a layer whose picture does not fill its surface', () => {
  /** A 1000 × 400 photo centred in a 1000² document — the shape that started all this. */
  const PHOTO: Rect = { x: 0, y: 300, width: 1000, height: 400 }

  it('frames the picture rather than the surface around it', () => {
    expect(layerCornersOf(IDENTITY, DOC, PHOTO)).toMatchObject({
      nw: { x: 0, y: 300 },
      se: { x: 1000, y: 700 },
    })
  })

  it('frames the whole surface when nothing says otherwise', () => {
    expect(layerCornersOf(IDENTITY, DOC)).toEqual(layerCornersOf(IDENTITY, DOC, wholeOf(DOC)))
  })

  it('measures the picture, not the document, under a scale', () => {
    const scaled: Transform = { ...IDENTITY, scaleX: 2, scaleY: 2, originX: 0, originY: 0 }

    expect(layerBoxOf(scaled, DOC, PHOTO)).toMatchObject({
      y: 600,
      width: 2000,
      height: 800,
    })
  })

  /** The grip's whole promise, now owed to the picture's edge rather than the surface's. */
  it('leaves the picture’s anchored edge where it was when a grip is pulled', () => {
    const next = resizeBy(IDENTITY, 'e', DOC, { x: 2000, y: 500 }, false, PHOTO)
    const box = layerBoxOf(next, DOC, PHOTO)

    expect(box).toMatchObject({ x: 0, width: 2000 })
  })

  it('anchors the picture’s top when its south grip is pulled', () => {
    const next = resizeBy(IDENTITY, 'se', DOC, { x: 1000, y: 1100 }, false, PHOTO)
    const box = layerBoxOf(next, DOC, PHOTO)

    expect(box).toMatchObject({ y: 300, height: 800 })
  })

  /**
   * The one a wrong anchor hides in: on a turned layer the held corner is re-solved through the
   * matrix, and taking it from the document would drift it by the margin `containIn` left.
   */
  it('holds the picture’s corner still through a turn', () => {
    const before = layerCornersOf(ASKEW, DOC, PHOTO)
    const next = resizeBy(ASKEW, 'se', DOC, { x: 1400, y: 900 }, false, PHOTO)
    const after = layerCornersOf(next, DOC, PHOTO)

    expect(after.nw.x).toBeCloseTo(before.nw.x, 6)
    expect(after.nw.y).toBeCloseTo(before.nw.y, 6)
  })

  // The layer painted by hand, whose surface IS its content: nothing may change for it.
  it('changes nothing for a layer that fills its surface', () => {
    const whole = resizeBy(PINNED, 'se', DOC, { x: 1400, y: 900 }, false, wholeOf(DOC))

    expect(whole).toEqual(resizeBy(PINNED, 'se', DOC, { x: 1400, y: 900 }, false))
  })
})

describe('turning about the middle', () => {
  const MIDDLE: Point = { x: 200, y: 150 }

  it('adds the angle the hand swept', () => {
    // From due north of the middle to due east of it: a quarter turn.
    const after = rotateBy(IDENTITY, MIDDLE, { x: 200, y: 50 }, { x: 300, y: 150 })

    expect(after.rotation).toBeCloseTo(Math.PI / 2)
  })

  it('adds to whatever the layer was already turned by', () => {
    const turned = { ...IDENTITY, rotation: Math.PI }
    const after = rotateBy(turned, MIDDLE, { x: 200, y: 50 }, { x: 300, y: 150 })

    expect(after.rotation).toBeCloseTo(Math.PI + Math.PI / 2)
  })

  /**
   * Free to the degree is the default on purpose: straightening a horizon is most of what a
   * rotation grip is used for, and steps would make that the one thing it cannot do.
   */
  it('follows the hand exactly, at whatever angle it lands on', () => {
    const after = rotateBy(IDENTITY, MIDDLE, { x: 200, y: 50 }, { x: 260, y: 60 })

    expect(after.rotation % (Math.PI / 12)).not.toBeCloseTo(0)
  })

  it('clicks into fifteen-degree steps while Shift is held', () => {
    const after = rotateBy(IDENTITY, MIDDLE, { x: 200, y: 50 }, { x: 260, y: 60 }, true)

    expect(after.rotation / (Math.PI / 12)).toBeCloseTo(Math.round(after.rotation / (Math.PI / 12)))
  })

  // The step lands on the resulting angle, not on the turn: snapping the delta would carry the
  // fraction the layer already held, and the box would never come out straight.
  it('straightens a layer that was already askew', () => {
    const askew = { ...IDENTITY, rotation: 0.05 }
    const after = rotateBy(askew, MIDDLE, { x: 200, y: 50 }, { x: 200, y: 50 }, true)

    expect(after.rotation).toBeCloseTo(0)
  })
})
