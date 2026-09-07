import { clamp } from '@shared/numeric'
import type { Rect } from './canvasState'
import type { Point, Size } from '../core/geometry'

/**
 * Where the document sits on screen. `x` and `y` are the screen position of the document's
 * top-left corner in CSS pixels; `scale` is how many screen pixels one document pixel takes.
 *
 * Session state, not document state: it is never serialized with the canvas, and ⌘Z does not
 * give a zoom back.
 */
export type Viewport = { x: number; y: number; scale: number }

/** Below 2% a 4096² document is a smear; above 64 a pixel fills a quarter of the screen. */
export const CANVAS_MIN_SCALE = 0.02
export const CANVAS_MAX_SCALE = 64

/** Breathing room around a fitted document, so its edge never touches the panel's. */
const FIT_PADDING = 24

const IDENTITY_VIEWPORT: Viewport = { x: 0, y: 0, scale: 1 }

/**
 * Everything about how a document is looked at rather than what it holds. Kept out of
 * `CanvasState` deliberately: none of it belongs in a saved file, and none of it belongs in the
 * undo stack — ⌘Z after a pan has to give a brush stroke back, not a scroll position.
 */
export type CanvasView = {
  viewport: Viewport
  rulers: boolean
  guides: boolean
  snap: boolean
  /** The pixel-art grid. Drawn only on a document that is on one — see `CanvasState.pixelCell`. */
  grid: boolean
}

export const DEFAULT_VIEW: CanvasView = {
  viewport: IDENTITY_VIEWPORT,
  rulers: true,
  guides: true,
  snap: true,
  grid: true,
}

export function sameViewport(a: Viewport, b: Viewport): boolean {
  return a.x === b.x && a.y === b.y && a.scale === b.scale
}

export function clampCanvasScale(scale: number): number {
  if (!Number.isFinite(scale)) return 1
  return clamp(scale, CANVAS_MIN_SCALE, CANVAS_MAX_SCALE)
}

/**
 * Half-pixel offset, or a one-pixel line spreads over two and comes out grey. Here rather than
 * with the painters: the overlay, the crop chrome and the grips all snap to the same grid, and
 * the convention belongs beside the screen-space maths it applies to.
 */
export function crisp(value: number): number {
  return Math.round(value) + 0.5
}

/**
 * The origin on whole DEVICE pixels: at ×8 a fractional one makes nearest-sampled blocks of 7 and
 * 9. For what is shown, never what is stored — a pan would accumulate its roundings.
 */
export function onDevicePixels(viewport: Viewport, ratio: number): Viewport {
  return {
    ...viewport,
    x: Math.round(viewport.x * ratio) / ratio,
    y: Math.round(viewport.y * ratio) / ratio,
  }
}

/**
 * The same convention on a DEVICE pixel, for a hairline one device pixel wide. The world's origin
 * is snapped there (`onDevicePixels`), so a line rounded in CSS pixels lands BESIDE the block it
 * marks rather than on it — on half the pan positions of a retina screen.
 */
export function crispOn(value: number, resolution: number): number {
  return (Math.round(value * resolution) + 0.5) / resolution
}

export function toScreen(viewport: Viewport, point: Point): Point {
  return { x: point.x * viewport.scale + viewport.x, y: point.y * viewport.scale + viewport.y }
}

export function toDocument(viewport: Viewport, point: Point): Point {
  return { x: (point.x - viewport.x) / viewport.scale, y: (point.y - viewport.y) / viewport.scale }
}

/**
 * Zooms while keeping whatever sits under `anchor` exactly where it is. Anything else makes the
 * wheel feel like it is dragging the image away from the pointer.
 */
export function zoomCanvasAt(viewport: Viewport, scale: number, anchor: Point): Viewport {
  const next = clampCanvasScale(scale)
  const point = toDocument(viewport, anchor)
  return { scale: next, x: anchor.x - point.x * next, y: anchor.y - point.y * next }
}

/**
 * The whole document visible and centred — never magnified, unless `integral`, where it lands on
 * the largest whole stop that fits: a 64² sprite fitted at 1 is a postage stamp in a panel.
 *
 * `inset` is what the chrome eats off the top and left — the ruler bands. Without it a document
 * barely smaller than the panel is centred with its first rows under an opaque band, where they
 * cannot be seen and cannot be painted.
 */
export function fitTo(document: Size, host: Size, inset: number = 0, integral = false): Viewport {
  const width = Math.max(1, host.width - inset - FIT_PADDING * 2)
  const height = Math.max(1, host.height - inset - FIT_PADDING * 2)
  const room = Math.min(width / Math.max(1, document.width), height / Math.max(1, document.height))
  // The tolerance for the same reason `EPSILON` exists: `room` comes out of two divisions, and a
  // hair under 8 would floor to 6 — a whole stop wrong.
  const fitted = integral
    ? (PIXEL_ZOOM_STOPS.findLast(stop => stop <= room + EPSILON) ?? room)
    : Math.min(1, room)
  return centerOn(document, host, clampCanvasScale(fitted), inset)
}

/**
 * A picture laid inside a box, centred, shrunk to fit but never magnified — the rule `fitTo`
 * keeps for a photograph, in document units rather than screen ones. Magnifying an imported picture to fill the
 * canvas would blur it on arrival, with no way back to its own pixels.
 */
export function containIn(source: Size, box: Size): Rect {
  const scale = Math.min(
    1,
    box.width / Math.max(1, source.width),
    box.height / Math.max(1, source.height),
  )
  const width = source.width * scale
  const height = source.height * scale

  return {
    x: Math.round((box.width - width) / 2),
    y: Math.round((box.height - height) / 2),
    width,
    height,
  }
}

/** Same framing as `fitTo`, at a scale the caller chose — ⌘1 lands here. */
export function centerOn(document: Size, host: Size, scale: number, inset: number = 0): Viewport {
  const next = clampCanvasScale(scale)
  return {
    scale: next,
    x: inset + Math.round((host.width - inset - document.width * next) / 2),
    y: inset + Math.round((host.height - inset - document.height * next) / 2),
  }
}

/**
 * The stops ⌘+ and ⌘− walk through. Photoshop's own ladder: doubling every step above 100% and
 * halving below it, with the odd stop in between where the eye needs one.
 */
const ZOOM_STOPS: readonly number[] = [
  0.02, 0.03, 0.05, 0.0625, 0.0833, 0.125, 0.1667, 0.25, 0.3333, 0.5, 0.6667, 1, 1.5, 2, 3, 4, 5, 6,
  8, 12, 16, 24, 32, 48, 64,
]

/**
 * The stops a pixel grid walks: a whole number of screen pixels per document one, or an exact
 * 1/2ⁿ. WRITTEN OUT, not filtered — `0.02` and `0.05` invert to 50 and 20, whole and unwanted,
 * and 1/32 is not on the ordinary ladder at all. It ends on the bounds, as `ZOOM_STOPS` does.
 */
const PIXEL_ZOOM_STOPS: readonly number[] = [
  0.03125, 0.0625, 0.125, 0.25, 0.5, 1, 2, 3, 4, 5, 6, 8, 12, 16, 24, 32, 48, 64,
]

/** A hair of tolerance, or a scale of 0.9999999 walks up to the stop it already sits on. */
const EPSILON = 1e-6

/** `integral` walks the pixel ladder instead — additive, so no existing caller moves. */
export function nextZoom(scale: number, integral = false): number {
  const stops = integral ? PIXEL_ZOOM_STOPS : ZOOM_STOPS
  // The ladder's own top, not the canvas bound: a ladder that ended elsewhere would put a step
  // off itself, and the next step back would jump.
  return stops.find(stop => stop > scale + EPSILON) ?? stops.at(-1) ?? CANVAS_MAX_SCALE
}

export function previousZoom(scale: number, integral = false): number {
  const stops = integral ? PIXEL_ZOOM_STOPS : ZOOM_STOPS
  return stops.findLast(stop => stop < scale - EPSILON) ?? stops[0] ?? CANVAS_MIN_SCALE
}

/**
 * How far a wheel travels before a grid moves one stop. Half a detent, which reports about 100
 * pixels of `deltaY` — measured in `engines/viewport/dolly.ts`, and the same number serves both.
 */
const WHEEL_NOTCH = 50

/**
 * One wheel event against the pixel ladder. Quantising the exponential result gives a DEAD
 * wheel — a small notch lands back on the stop it left — so travel accumulates in `debt`.
 *
 * The REMAINDER is carried, and a burst spends every stop it paid for: Chromium coalesces a fast
 * pinch into one event, and dropping what a stop did not consume made the zoom rate depend on how
 * the browser chunked the gesture rather than on how far the hand went. Aseprite's shape.
 */
export function wheelStep(
  scale: number,
  debt: number,
  deltaY: number,
): { scale: number; debt: number } {
  // A `deltaY` of zero is a sideways trackpad drift, not a notch: it must not clear what a pinch
  // has accumulated, which `Math.sign(0)` would.
  if (deltaY === 0) return { scale, debt }

  // Turned back: a trackpad's return swing would otherwise be swallowed by what it undoes.
  const travelled = (Math.sign(deltaY) === Math.sign(debt) ? debt : 0) + deltaY
  const stops = Math.trunc(travelled / WHEEL_NOTCH)
  if (stops === 0) return { scale, debt: travelled }

  let next = scale
  for (let step = 0; step < Math.abs(stops); step += 1) {
    next = stops < 0 ? nextZoom(next, true) : previousZoom(next, true)
  }
  return { scale: next, debt: travelled % WHEEL_NOTCH }
}

/**
 * The rectangle of the document that is currently on screen, in document coordinates. Rulers and
 * grids draw from it rather than walking the whole document: at 2% a 4096² canvas would emit
 * thousands of ticks nobody can see.
 */
export function visibleRect(viewport: Viewport, host: Size): Rect {
  const start = toDocument(viewport, { x: 0, y: 0 })
  const end = toDocument(viewport, { x: host.width, y: host.height })
  return { x: start.x, y: start.y, width: end.x - start.x, height: end.y - start.y }
}
