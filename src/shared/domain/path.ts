/**
 * A run of points and the curve through them — what a rail is, and what a ribbon is swept along.
 *
 * Here rather than in `scene.ts` for the reason `transform.ts` left: `geometry.ts` reads this,
 * and `scene.ts` reads `geometry.ts` — the two together would close the cycle
 * `import-cycles.test.ts` holds at zero.
 */
import type { Vector3 } from './transform'

/**
 * One anchor's two tangents, RELATIVE to the anchor: `in` reaches back towards the point before,
 * `out` on towards the next. Independent, which is what a corner in a smooth run needs.
 */
export type PathHandle = { in: Vector3; out: Vector3 }

/**
 * A rail: the line a camera runs along, and the run a band is swept along.
 *
 * Two shapes, and the anchors are common to both — everything that reads `points` reads either.
 * `catmullrom` bends by one number for the whole run; `bezier` gives every anchor its own pair of
 * tangents, which is the only way to set the angle AT a point.
 */
export type SmoothPath = {
  kind: 'catmullrom'
  points: readonly Vector3[]
  closed: boolean
  /** Catmull-Rom tension: 0 is angular, 0.5 is three.js's own default. */
  tension: number
}

export type PathDescriptor =
  | SmoothPath
  | {
      kind: 'bezier'
      points: readonly Vector3[]
      closed: boolean
      /** One per anchor, in the same order. `handlesMatch` is what holds the two lengths equal. */
      handles: readonly PathHandle[]
    }

export const DEFAULT_PATH: SmoothPath = Object.freeze({
  kind: 'catmullrom',
  // Five units apart along Z, which is the axis a camera born from the Add menu looks down.
  points: Object.freeze([
    Object.freeze({ x: 0, y: 0, z: 0 }),
    Object.freeze({ x: 0, y: 0, z: -5 }),
  ]),
  closed: false,
  tension: 0.5,
})

/** Whether a Bézier run carries exactly one pair of tangents per anchor. */
export function handlesMatch(path: PathDescriptor): boolean {
  return path.kind !== 'bezier' || path.handles.length === path.points.length
}

/** A third of the way to the neighbour: the tangents a smooth curve through the points would have. */
const SMOOTH_REACH = 1 / 6

/**
 * The same run as a Bézier one, with tangents that keep the shape it already had.
 *
 * 🛑 Each tangent is a sixth of the span between the anchor's two NEIGHBOURS — the Catmull-Rom
 * tangent, which is what makes the conversion invisible rather than a curve that jumps.
 */
export function bezierPathOf(points: readonly Vector3[], closed: boolean): PathDescriptor {
  const last = points.length - 1
  // 🛑 An OPEN run has no neighbour past its ends: wrapped round, the first anchor took its
  // tangent from the last one and the curve jumped away from the very shape it was to keep.
  const neighbour = (at: number): Vector3 =>
    closed
      ? points[(at + points.length) % points.length]!
      : points[Math.min(Math.max(at, 0), last)]!

  const handles = points.map((_, at) => {
    const before = neighbour(at - 1)
    const after = neighbour(at + 1)
    const reach = {
      x: (after.x - before.x) * SMOOTH_REACH,
      y: (after.y - before.y) * SMOOTH_REACH,
      z: (after.z - before.z) * SMOOTH_REACH,
    }
    return { in: { x: -reach.x, y: -reach.y, z: -reach.z }, out: reach }
  })

  return { kind: 'bezier', points, closed, handles }
}

/** The tangents an anchor carries, or a pair of zeroes for a run that has none. */
export function handleAt(path: PathDescriptor, index: number): PathHandle {
  const held = path.kind === 'bezier' ? path.handles[index] : undefined
  return held ?? { in: { x: 0, y: 0, z: 0 }, out: { x: 0, y: 0, z: 0 } }
}
