import { clampAtLeast } from '@shared/numeric'

/**
 * How a viewport's surface is divided, and where each division lands.
 *
 * Pure geometry, deliberately: four views on one canvas is `setViewport`/`setScissor` arithmetic
 * before it is anything else, and arithmetic that only runs behind a GPU is arithmetic nothing
 * measures — jsdom has no WebGL context.
 */

/** In CSS pixels, origin top-left — the frame the DOM and the pointer both speak. */
export type PaneRect = { x: number; y: number; width: number; height: number }

/** One view filling the surface, or the four of a modelling package: top, front, left, free. */
export type PaneLayout = 'single' | 'quad'

const PANE_LAYOUTS: readonly PaneLayout[] = ['single', 'quad']

export function isPaneLayout(value: string): value is PaneLayout {
  return PANE_LAYOUTS.some(layout => layout === value)
}

/** How many views a layout draws. The one number both the engine and its callers size arrays by. */
export function paneCount(layout: PaneLayout): number {
  return layout === 'quad' ? 4 : 1
}

/**
 * Where each view sits, reading left to right then top to bottom.
 *
 * The right column takes what the left one rounded away, and the bottom row likewise: halves of
 * an odd width floored twice leave a column of pixels drawn by nobody, and an undrawn column on a
 * dark canvas reads as a seam the design never asked for.
 */
export function paneRects(layout: PaneLayout, width: number, height: number): PaneRect[] {
  const full = { x: 0, y: 0, width, height }
  if (layout === 'single') return [full]

  const left = Math.floor(width / 2)
  const top = Math.floor(height / 2)
  const right = width - left
  const bottom = height - top

  return [
    { x: 0, y: 0, width: left, height: top },
    { x: left, y: 0, width: right, height: top },
    { x: 0, y: top, width: left, height: bottom },
    { x: left, y: top, width: right, height: bottom },
  ]
}

/** How wide the inset sits, as a share of the surface, and how far it stands off its corner. */
const INSET_SHARE = 0.28
const INSET_MARGIN = 12

/** Past this share of the height the inset stops being an inset and starts being the view. */
const INSET_MAX_HEIGHT = 0.4

/**
 * Where a camera preview opens: top right, at the aspect of what that camera films.
 *
 * TOP and not bottom: the gizmo of whatever is selected stands at the middle of the view and its
 * arms reach down and out, so a preview in the lower corner sat under the very handles a hand is
 * reaching for.
 *
 * `null` for a surface with no room for one — an inset wider than the view it sits on would hide
 * the very thing it is a preview OF. Sized from the surface rather than fixed, so it stays the
 * same fraction of a detached panel as of a full window.
 */
export function insetRect(width: number, height: number, aspect: number): PaneRect | null {
  if (width <= 0 || height <= 0 || aspect <= 0) return null

  const insetWidth = Math.round(width * INSET_SHARE)
  const insetHeight = Math.round(insetWidth / aspect)
  if (insetHeight > height * INSET_MAX_HEIGHT) return null
  if (insetWidth + INSET_MARGIN * 2 > width) return null

  return {
    x: width - insetWidth - INSET_MARGIN,
    y: INSET_MARGIN,
    width: insetWidth,
    height: insetHeight,
  }
}

/** How big a preview is drawn: in its corner, or over the whole view. */
export type InsetSize = 'inset' | 'full'

/**
 * Where a camera preview sits at either size. The grown one takes the surface whole, which is
 * what lets a renderer skip the panes it would cover — the arithmetic of both stays here.
 */
export function previewRect(
  width: number,
  height: number,
  aspect: number,
  size: InsetSize,
  offset: { x: number; y: number } = { x: 0, y: 0 },
): PaneRect | null {
  if (width <= 0 || height <= 0) return null
  if (size === 'full') return { x: 0, y: 0, width, height }

  const rect = insetRect(width, height, aspect)
  return rect && movedInside(rect, width, height, offset)
}

/**
 * The preview where it was dragged to, kept whole inside the view.
 *
 * Clamped rather than free: a preview pushed past the edge cannot be dragged back — the pointer
 * has nothing left to grab — and one shoved off screen is indistinguishable from one that closed.
 */
function movedInside(
  rect: PaneRect,
  width: number,
  height: number,
  offset: { x: number; y: number },
): PaneRect {
  return {
    ...rect,
    x: clampAtLeast(rect.x + offset.x, 0, width - rect.width),
    y: clampAtLeast(rect.y + offset.y, 0, height - rect.height),
  }
}

/** Whether a point falls inside a rectangle — the inset's own test, and `paneAt`'s. */
export function inRect(rect: PaneRect, x: number, y: number): boolean {
  return x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height
}

/**
 * Which view a point falls in, or `null` when it falls outside the surface entirely.
 *
 * Edges belong to the pane they open: a point exactly on the divider is in the right or lower
 * one, so no coordinate is claimed twice and none is claimed by nobody.
 */
export function paneAt(rects: readonly PaneRect[], x: number, y: number): number | null {
  const found = rects.findIndex(rect => inRect(rect, x, y))
  return found === -1 ? null : found
}

/**
 * The same rectangle the other way up: origin bottom-left, as `setViewport` and `setScissor`
 * read it, and still in CSS pixels.
 *
 * NOT in device pixels, however much the name of the frame suggests it: three multiplies by the
 * renderer's pixel ratio itself (`WebGLRenderer.setViewport`). Scaling here as well squared the
 * ratio — on a display at 2, the first pane covered four times its share and hid the other
 * three, which is a quad view that draws exactly one view.
 */
export function glRect(rect: PaneRect, surfaceHeight: number): PaneRect {
  return intoGlRect(rect, surfaceHeight, { x: 0, y: 0, width: 0, height: 0 })
}

/** The same flip written into a rectangle one already holds — for the callers on a hot path. */
export function intoGlRect(rect: PaneRect, surfaceHeight: number, into: PaneRect): PaneRect {
  into.x = rect.x
  into.y = surfaceHeight - rect.y - rect.height
  into.width = rect.width
  into.height = rect.height
  return into
}
