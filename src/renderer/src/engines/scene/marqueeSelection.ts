import type { Point } from '../core/geometry'
import { offScreen, type ProjectedSegment } from './bonePicking'

/**
 * What a rectangle dragged across the viewport takes, as screen arithmetic.
 *
 * Frame-agnostic on purpose, and named for it: the picking measures in device coordinates, whose
 * second axis climbs, and the outline in CSS pixels, whose second axis falls. `minY` is true of
 * either, where `top` would be true of one.
 */
export type ScreenBox = { minX: number; minY: number; maxX: number; maxY: number }

/** A node as the screen sees it — see `screenBodies` in `SceneRenderer`. */
export type ScreenBody = { id: string; box: ScreenBox }

/** The box two dragged corners carve out, whichever way the hand went. */
export function boxBetween(from: Point, to: Point): ScreenBox {
  return {
    minX: Math.min(from.x, to.x),
    minY: Math.min(from.y, to.y),
    maxX: Math.max(from.x, to.x),
    maxY: Math.max(from.y, to.y),
  }
}

/**
 * What a body covers around its centre, one half-extent per AXIS: device coordinates normalise
 * each side of the view separately, so one world radius is two different numbers on a wide pane.
 */
export function boxAround(centre: Point, radiusX: number, radiusY = radiusX): ScreenBox {
  return {
    minX: centre.x - radiusX,
    minY: centre.y - radiusY,
    maxX: centre.x + radiusX,
    maxY: centre.y + radiusY,
  }
}

/**
 * Whether two boxes share any surface at all.
 *
 * TOUCHING takes, as it does in Unity and in Unreal: a marquee that had to swallow a body whole
 * would miss everything larger than itself, and a floor is always larger than itself.
 */
export function boxesTouch(one: ScreenBox, other: ScreenBox): boolean {
  return (
    one.minX <= other.maxX &&
    other.minX <= one.maxX &&
    one.minY <= other.maxY &&
    other.minY <= one.maxY
  )
}

/** Whether a point falls inside — the degenerate case of the test above, spelled once. */
export function boxHolds(box: ScreenBox, point: Point): boolean {
  return point.x >= box.minX && point.x <= box.maxX && point.y >= box.minY && point.y <= box.maxY
}

/** The ids a marquee takes, in the order they were handed over — a set of nodes has no depth. */
export function idsTouching(marquee: ScreenBox, bodies: Iterable<ScreenBody>): string[] {
  const taken: string[] = []
  for (const body of bodies) if (boxesTouch(marquee, body.box)) taken.push(body.id)
  return taken
}

/**
 * The bone a marquee names in pose mode: the one NEAREST the camera among those it crosses.
 *
 * One, because a pose holds one picked bone — `pickedBone` is a single pair everywhere it is
 * read. What the rectangle buys over a click is reach, not a plural: it takes the bone in front
 * where a click would have taken whatever line happened to lie under the pointer.
 */
export function frontmostSegmentIn(
  segments: readonly ProjectedSegment[],
  marquee: ScreenBox,
): ProjectedSegment | null {
  let best: ProjectedSegment | null = null

  for (const segment of segments) {
    // Either end is enough, and only an end that is on screen: a bone leaving the view is still
    // half of it takeable — the same reading `nearestSegment` makes of the pointer.
    const crossed = [segment.head, segment.tail].some(
      end => !offScreen(end) && boxHolds(marquee, end),
    )
    if (!crossed) continue

    if (!best || segment.head.z < best.head.z) best = segment
  }

  return best
}
