import type { Rect, Transform } from './canvasState'
import { anchoredAt, applyTo, layerMatrix } from './layerSpace'
import { crisp, toScreen, type Viewport } from './viewport'
import type { Point, Size } from '../core/geometry'

/**
 * The eight grips of a transform box. Pixi ships no transformer, so the geometry is ours — and
 * being plain arithmetic it belongs here, where it can be tested without a GPU.
 *
 * There is no ninth grip for rotation: it is a zone just outside each corner, as in Figma and
 * Photoshop. A square floating above the box was indistinguishable from the eight others.
 */
export type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

export const HANDLE_IDS: readonly HandleId[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

/** The four corners, in the order that walks the outline. */
export type CornerId = 'nw' | 'ne' | 'se' | 'sw'

export const CORNER_IDS: readonly CornerId[] = ['nw', 'ne', 'se', 'sw']

/**
 * A box as its four corners rather than as an origin and a size: under a rotation it is not an
 * axis-aligned rectangle at all, and every grip has to sit on the shape actually on screen.
 */
export type Corners = Readonly<Record<CornerId, Point>>

/** Which corner each grip pulls against: the opposite one stays put, as it does everywhere. */
export const ANCHOR: Readonly<Record<HandleId, { x: number; y: number }>> = {
  nw: { x: 1, y: 1 },
  n: { x: 0.5, y: 1 },
  ne: { x: 0, y: 1 },
  e: { x: 0, y: 0.5 },
  se: { x: 0, y: 0 },
  s: { x: 0.5, y: 0 },
  sw: { x: 1, y: 0 },
  w: { x: 1, y: 0.5 },
}

/**
 * Which way a grip pulls, before the layer is turned: `nw` goes up and left, `e` goes right.
 * Read off `ANCHOR` rather than tabled again — the anchor is the opposite corner, so the
 * direction is what points away from it.
 */
export function handleDirection(handle: HandleId): Point {
  const anchor = ANCHOR[handle]
  return { x: 1 - 2 * anchor.x, y: 1 - 2 * anchor.y }
}

/** No box collapses to nothing: a caption one pixel wide wraps every word onto its own line. */
const MIN_BOX = 8

/**
 * Where a grip drags a BOX to, in that box's own space — the edges it names move, the others
 * hold. Its origin moves with a north or west grip, which is why a rectangle comes back rather
 * than a size: the caller owes the layer that displacement.
 *
 * Apart from `resizeBy`, which scales a whole layer: a caption's box is resized rather than
 * stretched, so its words keep the body they were set in and simply wrap somewhere else.
 */
export function resizedBox(handle: HandleId, box: Size, local: Point, constrain = false): Rect {
  const west = handle.includes('w')
  const east = handle.includes('e')
  const north = handle.startsWith('n')
  const south = handle.startsWith('s')

  // Rounded: a box is a count of document pixels, and a drag at 57 % zoom otherwise lands on
  // 627.6371549601888 — a number the panel shows in full and nobody can read back.
  const left = west ? Math.round(Math.min(local.x, box.width - MIN_BOX)) : 0
  const top = north ? Math.round(Math.min(local.y, box.height - MIN_BOX)) : 0
  const right = east ? Math.round(Math.max(local.x, left + MIN_BOX)) : box.width
  const bottom = south ? Math.round(Math.max(local.y, top + MIN_BOX)) : box.height

  const pulled = { x: left, y: top, width: right - left, height: bottom - top }
  // Shift holds the ratio, as it does everywhere else here. On an edge grip there is only one
  // axis to hold, and the other simply follows it.
  return constrain ? inRatio(pulled, box, { north, west }) : pulled
}

/** The same pull, taken back to the box's own ratio — the larger side is what it is read from. */
function inRatio(pulled: Rect, box: Size, from: { north: boolean; west: boolean }): Rect {
  const ratio = box.height / box.width
  const wide = pulled.width * ratio >= pulled.height
  const width = wide ? pulled.width : pulled.height / ratio
  const height = wide ? pulled.width * ratio : pulled.height

  // A grip that moved the origin keeps the far edge still, so the corner takes up the slack.
  return {
    x: from.west ? pulled.x + pulled.width - width : pulled.x,
    y: from.north ? pulled.y + pulled.height - height : pulled.y,
    width,
    height,
  }
}

/** Half the side of the square a grip is drawn as, in screen pixels — grips ignore the zoom. */
const HANDLE_SIZE = 4

/** Half the side of a grip's hit square, in screen pixels. Larger than what is drawn: aiming at
 * eight pixels is what made the box feel like it demanded a surgeon. */
export const HANDLE_GRAB = 8

/** How far past a corner the rotation zone reaches, in screen pixels. */
export const ROTATE_REACH = 22

/**
 * The frame `resizeBy` solves in: axis-aligned, and therefore **ignoring both rotation and
 * skew**. It is an intermediate coordinate space, not a rival to `layerCornersOf` — anything
 * drawn, grabbed or measured against the picture wants the corners.
 *
 * Exported for the tests, which read a scale back off it rather than asserting on nine numbers.
 */
export function layerBoxOf(
  transform: Transform,
  document: Size,
  frame: Rect = wholeOf(document),
): Rect {
  return {
    x:
      transform.x +
      document.width * transform.originX * (1 - transform.scaleX) +
      frame.x * transform.scaleX,
    y:
      transform.y +
      document.height * transform.originY * (1 - transform.scaleY) +
      frame.y * transform.scaleY,
    width: frame.width * transform.scaleX,
    height: frame.height * transform.scaleY,
  }
}

/**
 * The rect a layer's handles describe, in document coordinates — the whole surface unless the
 * caller knows better.
 *
 * A layer painted by hand has no better answer: its surface IS its content, and every pixel of
 * it is fair game. A layer holding a PICTURE does — `containIn` centres it and leaves transparent
 * margins on two sides — and framing those margins frames nothing. That is what every other
 * editor shows for a picture layer, and what the studio showed instead was the document: a
 * 4112 × 2658 photo in a 1024² document was gripped by a square that touched it nowhere.
 */
export function wholeOf(document: Size): Rect {
  return { x: 0, y: 0, width: document.width, height: document.height }
}

/**
 * The four corners a layer actually occupies, rotation and skew included.
 *
 * Taken through `layerMatrix` rather than derived here: that matrix is what Pixi composes for the
 * sprite, and a second formula for the same thing is a box that drifts from the picture under it.
 */
export function layerCornersOf(
  transform: Transform,
  document: Size,
  frame: Rect = wholeOf(document),
): Corners {
  const matrix = layerMatrix(transform, document)
  const corners = cornersOfRect(frame)

  return {
    nw: applyTo(matrix, corners.nw),
    ne: applyTo(matrix, corners.ne),
    se: applyTo(matrix, corners.se),
    sw: applyTo(matrix, corners.sw),
  }
}

/** The corners of an axis-aligned rectangle — what the crop frame, which never turns, hands in. */
export function cornersOfRect(rect: Rect): Corners {
  const right = rect.x + rect.width
  const bottom = rect.y + rect.height

  return {
    nw: { x: rect.x, y: rect.y },
    ne: { x: right, y: rect.y },
    se: { x: right, y: bottom },
    sw: { x: rect.x, y: bottom },
  }
}

export function centerOf(corners: Corners): Point {
  return {
    x: (corners.nw.x + corners.ne.x + corners.se.x + corners.sw.x) / 4,
    y: (corners.nw.y + corners.ne.y + corners.se.y + corners.sw.y) / 4,
  }
}

/** Where each grip sits, in document coordinates: the four corners, and the middle of each edge. */
export function handlePoints(corners: Corners): Readonly<Record<HandleId, Point>> {
  return {
    nw: corners.nw,
    n: middle(corners.nw, corners.ne),
    ne: corners.ne,
    e: middle(corners.ne, corners.se),
    se: corners.se,
    s: middle(corners.se, corners.sw),
    sw: corners.sw,
    w: middle(corners.sw, corners.nw),
  }
}

/**
 * The squares each grip is drawn as, in screen pixels. Fixed-size on purpose: a grip that shrank
 * with the zoom would be unclickable on a document seen at 5%.
 *
 * Here rather than at each call site because two of them draw grips — the move tool's box and the
 * crop frame — and the size and the half-pixel offset have to agree between them.
 */
export function gripRects(corners: Corners, viewport: Viewport): Readonly<Record<HandleId, Rect>> {
  const points = handlePoints(corners)
  const square = (id: HandleId): Rect => {
    const screen = toScreen(viewport, points[id])
    return {
      x: crisp(screen.x - HANDLE_SIZE),
      y: crisp(screen.y - HANDLE_SIZE),
      width: HANDLE_SIZE * 2,
      height: HANDLE_SIZE * 2,
    }
  }

  return {
    nw: square('nw'),
    n: square('n'),
    ne: square('ne'),
    e: square('e'),
    se: square('se'),
    s: square('s'),
    sw: square('sw'),
    w: square('w'),
  }
}

/** The outline of the box, in document units — the four corners, in the order that walks them. */
export function outlinePoints(corners: Corners): readonly Point[] {
  return CORNER_IDS.map(id => corners[id])
}

/**
 * What the chrome of a transform box offers at a point: a grip to pull, a corner to turn by, or
 * nothing.
 *
 * One function rather than one per gesture, because the press and the cursor have to agree. They
 * used to be written twice — the same two tolerances and the same precedence — and the failure of
 * a drift between them is a cursor promising a gesture the press then refuses.
 */
export type HandleHit = { kind: 'handle'; id: HandleId } | { kind: 'rotate'; id: CornerId }

export function hitTest(
  corners: Corners,
  point: Point,
  grab: number,
  reach: number,
): HandleHit | null {
  const points = handlePoints(corners)
  const grip = HANDLE_IDS.find(id => {
    const at = points[id]
    return Math.abs(at.x - point.x) <= grab && Math.abs(at.y - point.y) <= grab
  })
  if (grip) return { kind: 'handle', id: grip }

  const corner = rotationCornerAt(corners, point, reach)
  return corner ? { kind: 'rotate', id: corner } : null
}

/** The two corners each one shares an edge with — what says which way is out of the box. */
const EDGES_FROM: Readonly<Record<CornerId, readonly [CornerId, CornerId]>> = {
  nw: ['ne', 'sw'],
  ne: ['se', 'nw'],
  se: ['sw', 'ne'],
  sw: ['nw', 'se'],
}

/**
 * The corner whose rotation zone holds the point: the quarter-disc just *outside* a corner, which
 * is where Figma and Photoshop both put it.
 *
 * Outside means behind **both** edges that leave the corner — the quadrant they point away from.
 * Measured against the edges themselves rather than against the middle of the box, which would
 * describe the outside of the circumscribed circle instead: on a 1000×100 layer that circle's
 * tangent runs almost vertical at the corner, and the whole ring along the long edge would be
 * classed as inside, leaving nowhere to grab the rotation from.
 */
export function rotationCornerAt(corners: Corners, point: Point, reach: number): CornerId | null {
  for (const id of CORNER_IDS) {
    const corner = corners[id]
    // Not "nearest corner, then test": zoomed out, two corners can both be within reach, and the
    // one that fails this has to let the next be tried.
    if (distance(point, corner) > reach) continue

    const [along, down] = EDGES_FROM[id]
    if (beyond(point, corner, corners[along]) && beyond(point, corner, corners[down])) return id
  }

  return null
}

/** Whether the point lies on the far side of the corner from an edge leaving it. */
function beyond(point: Point, corner: Point, neighbour: Point): boolean {
  const edgeX = neighbour.x - corner.x
  const edgeY = neighbour.y - corner.y
  return (point.x - corner.x) * edgeX + (point.y - corner.y) * edgeY <= 0
}

/**
 * A point of the box as it stands on screen, brought back into the un-turned box `layerBoxOf`
 * describes.
 *
 * Both matrices send the pivot to the same place — the rotation is applied about it — so undoing
 * the turn is one rotation of `-rotation` about that point, with no matrix to build. Skew is
 * untouched by design: it belongs to the inner matrix the rotation is applied *after*.
 */
export function unrotated(transform: Transform, document: Size, point: Point): Point {
  if (transform.rotation === 0) return point

  const pivot = {
    x: transform.x + transform.originX * document.width,
    y: transform.y + transform.originY * document.height,
  }
  const dx = point.x - pivot.x
  const dy = point.y - pivot.y
  const cos = Math.cos(-transform.rotation)
  const sin = Math.sin(-transform.rotation)

  return {
    x: cos * dx - sin * dy + pivot.x,
    y: sin * dx + cos * dy + pivot.y,
  }
}

/**
 * The transform a drag of one grip produces. The opposite corner stays put — pull the east grip
 * and the west edge does not move, which is the only behaviour that lets a layer be sized against
 * something else on the canvas.
 *
 * `uniform` is the shift key: the shorter side follows the longer, so a picture keeps its shape.
 *
 * The pointer is un-turned before anything else: the whole solution below is in axis-aligned
 * space, and on a rotated layer a drag along the visible edge would otherwise be read as a pull
 * across it.
 */
export function resizeBy(
  transform: Transform,
  handle: HandleId,
  document: Size,
  to: Point,
  uniform: boolean,
  frame: Rect = wholeOf(document),
): Transform {
  const box = layerBoxOf(transform, document, frame)
  const straight = unrotated(transform, document, to)
  const anchor = ANCHOR[handle]
  const fixed = { x: box.x + box.width * anchor.x, y: box.y + box.height * anchor.y }
  const pullsX = anchor.x !== 0.5
  const pullsY = anchor.y !== 0.5
  let scaleX = pullsX ? ratio(straight.x - fixed.x, box.width * (anchor.x === 1 ? -1 : 1)) : 1
  let scaleY = pullsY ? ratio(straight.y - fixed.y, box.height * (anchor.y === 1 ? -1 : 1)) : 1
  if (uniform && pullsX && pullsY) {
    const side = Math.max(Math.abs(scaleX), Math.abs(scaleY))
    scaleX = side * Math.sign(scaleX || 1)
    scaleY = side * Math.sign(scaleY || 1)
  }
  const scaled = {
    ...transform,
    scaleX: floored(transform.scaleX * scaleX),
    scaleY: floored(transform.scaleY * scaleY),
  }
  const held = { x: frame.x + anchor.x * frame.width, y: frame.y + anchor.y * frame.height }
  return anchoredAt(scaled, document, held, applyTo(layerMatrix(transform, document), held))
}

/**
 * Every fifteen degrees, which is what Shift buys on a rotation grip everywhere else.
 *
 * Applied to the resulting angle rather than to the turn: snapping the delta would carry
 * whatever fraction the layer already held, and the box would never sit straight.
 */
const ROTATION_STEP = Math.PI / 12

/**
 * The angle the hand swept about `center`, added to what the layer already held.
 *
 * Free to the degree unless `constrain` says otherwise — a rotation that always clicked into
 * steps could not be used to straighten a horizon, which is most of what one rotates for.
 */
export function rotateBy(
  transform: Transform,
  center: Point,
  from: Point,
  to: Point,
  constrain = false,
): Transform {
  const before = Math.atan2(from.y - center.y, from.x - center.x)
  const after = Math.atan2(to.y - center.y, to.x - center.x)
  const rotation = transform.rotation + after - before

  return {
    ...transform,
    rotation: constrain ? Math.round(rotation / ROTATION_STEP) * ROTATION_STEP : rotation,
  }
}

/**
 * The smallest a layer may be scaled to. On the *result*, not on one gesture's step: the steps
 * multiply, so three collapsing drags of a bounded ratio still reached a millionth. A layer that
 * small has no box left to grab, and only ⌘Z would bring it back.
 */
const LAYER_MIN_SCALE = 0.01

function middle(one: Point, other: Point): Point {
  return { x: (one.x + other.x) / 2, y: (one.y + other.y) / 2 }
}

function distance(one: Point, other: Point): number {
  return Math.hypot(one.x - other.x, one.y - other.y)
}

function ratio(moved: number, extent: number): number {
  // Near-zero, not exactly zero: a box that has already collapsed would divide by ~1e-17.
  if (Math.abs(extent) < Number.EPSILON) return 1
  return moved / extent
}

/** Keeps a scale off zero without flipping the mirror the user may have asked for. */
function floored(scale: number): number {
  return Math.abs(scale) < LAYER_MIN_SCALE ? LAYER_MIN_SCALE * Math.sign(scale || 1) : scale
}
