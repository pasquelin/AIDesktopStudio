/**
 * What the user can see of a sequence, and how the wheel and the zoom keys move it. Pure, and
 * kept out of `SequenceState` on purpose: where one is looking is not an edit, and pushing it
 * through the history would make undo step back through scroll positions.
 */
import { clamp } from '@shared/numeric'
import { maxOffsetFor, maxScrollTopFor } from './band'
import { RULER_HEIGHT, tracksHeight, visibleRange, type Viewport } from './timelineGeometry'
import { sequenceDuration, type SequenceState, type Us } from './timelineState'
import type { Size } from '../core/geometry'

// Bare because the CANVAS took the prefix: the two ranges are four orders apart and an
// auto-import once crossed them. `canvas/viewport.test.ts` reads both sides and holds the gap.
/** One pixel a second: a twenty-minute rush still fits across a wide strip. */
export const MIN_SCALE = 1 / 1_000_000
/** Two thousand pixels a second: a couple of frames fill the strip, which is as far as trimming needs. */
export const MAX_SCALE = 2_000 / 1_000_000
const DEFAULT_SCALE = 100 / 1_000_000

export const DEFAULT_VIEWPORT: Viewport = { scale: DEFAULT_SCALE, offset: 0, scrollTop: 0 }

/** One press of the zoom key. A quarter step reads as a move without losing one's place. */
export const ZOOM_STEP = 1.25

export function clampScale(scale: number): number {
  return clamp(scale, MIN_SCALE, MAX_SCALE)
}

/**
 * How far right the view may go: far enough to bring the end of the sequence to the middle of
 * the strip, so there is room to drop a clip after the last one, and no further — scrolling
 * into unbounded emptiness loses the montage off the left edge.
 */
function maxOffset(state: SequenceState, scale: number, width: number): Us {
  return maxOffsetFor(sequenceDuration(state), scale, width)
}

export function maxScrollTop(state: SequenceState, height: number): number {
  return maxScrollTopFor(tracksHeight(state), height, RULER_HEIGHT)
}

export function clampViewport(viewport: Viewport, state: SequenceState, size: Size): Viewport {
  const scale = clampScale(viewport.scale)
  const offset = clamp(Math.round(viewport.offset), 0, maxOffset(state, scale, size.width))
  const scrollTop = clamp(Math.round(viewport.scrollTop), 0, maxScrollTop(state, size.height))

  // The same viewport back when nothing moved, as `zoomAt` and `revealTime` already do: panning
  // against an edge would otherwise write to the store and repaint the strip on every pixel.
  if (scale === viewport.scale && offset === viewport.offset && scrollTop === viewport.scrollTop) {
    return viewport
  }
  return { scale, offset, scrollTop }
}

/**
 * Zoom around a pixel: the instant under the cursor stays under the cursor. Zooming around the
 * left edge instead is what makes a timeline feel like it runs away while you look at it.
 */
export function zoomAt(viewport: Viewport, factor: number, anchorX: number): Viewport {
  const scale = clampScale(viewport.scale * factor)
  if (scale === viewport.scale) return viewport

  const anchored = viewport.offset + anchorX / viewport.scale
  return { ...viewport, scale, offset: Math.max(0, Math.round(anchored - anchorX / scale)) }
}

export function scrollBy(viewport: Viewport, deltaX: number, deltaY: number): Viewport {
  return {
    ...viewport,
    offset: Math.max(0, Math.round(viewport.offset + deltaX / viewport.scale)),
    scrollTop: Math.max(0, Math.round(viewport.scrollTop + deltaY)),
  }
}

/** The whole sequence across the strip, with a margin so the last frame is not flush to the edge. */
export function fitToWidth(state: SequenceState, width: number): Viewport {
  const duration = sequenceDuration(state)
  if (duration <= 0 || width <= 0) return DEFAULT_VIEWPORT

  return { scale: clampScale((width * 0.96) / duration), offset: 0, scrollTop: 0 }
}

/**
 * Brings an instant into view without changing the zoom, and only when it is out of it: a
 * playhead reached by playback must not drag the view on every frame it is already visible in.
 */
export function revealTime(viewport: Viewport, time: Us, width: number): Viewport {
  const [from, to] = visibleRange(viewport, width)
  if (time >= from && time <= to) return viewport

  const span = to - from
  return { ...viewport, offset: Math.max(0, Math.round(time - span / 2)) }
}
