import { CatmullRomCurve3, CubicBezierCurve3, CurvePath, Line3, Vector3, type Curve } from 'three'
import type { PathDescriptor, Vector3 as PlainVector3 } from '@shared/domain/scene'
import { bezierPathOf, handleAt } from '@shared/domain/scene'
import { clamp } from '@shared/numeric'
import { cachedOn } from '../core/cachedOn'

/**
 * The curve a rail describes, and the cache that keeps it from being rebuilt every frame.
 *
 * Keyed by the identity of the descriptor: every edit of a scene replaces the object it touches,
 * so a descriptor that is the same object is a rail whose points have not moved. `updateArcLengths`
 * runs when the curve is BUILT and never on a frame — it walks the whole curve.
 */
const curves = new WeakMap<PathDescriptor, Curve<Vector3>>()

/** How many samples a rail is drawn with. Enough for a smooth line at the scale a studio uses. */
export const PATH_SAMPLES = 64

export function curveOf(path: PathDescriptor): Curve<Vector3> {
  return cachedOn(curves, path, () => {
    const curve = path.kind === 'bezier' ? bezierCurve(path) : catmullCurve(path)
    // Arc lengths are what `getPointAt` reads, and what makes a camera move run at a steady speed:
    // `getPoint` is parameterised per segment, so a camera speeds up through the short ones.
    curve.updateArcLengths()
    return curve
  })
}

function catmullCurve(path: Extract<PathDescriptor, { kind: 'catmullrom' }>): Curve<Vector3> {
  return new CatmullRomCurve3(
    path.points.map(point => new Vector3(point.x, point.y, point.z)),
    path.closed,
    'catmullrom',
    path.tension,
  )
}

/**
 * One cubic per span, each leaving its anchor along that anchor's `out` and arriving at the next
 * along the next one's `in` — which is what puts the angle of the curve in the author's hands.
 */
function bezierCurve(path: Extract<PathDescriptor, { kind: 'bezier' }>): Curve<Vector3> {
  const curve = new CurvePath<Vector3>()
  const spans = path.closed ? path.points.length : path.points.length - 1
  const away = (point: PlainVector3, handle: PlainVector3): Vector3 =>
    new Vector3(point.x + handle.x, point.y + handle.y, point.z + handle.z)

  for (let at = 0; at < spans; at += 1) {
    const from = path.points[at]!
    const to = path.points[(at + 1) % path.points.length]!
    curve.add(
      new CubicBezierCurve3(
        new Vector3(from.x, from.y, from.z),
        away(from, handleAt(path, at).out),
        away(to, handleAt(path, (at + 1) % path.points.length).in),
        new Vector3(to.x, to.y, to.z),
      ),
    )
  }

  return curve
}

/** The line to draw, sampled by arc length so the points sit evenly along it. */
export function pathPoints(path: PathDescriptor, samples: number = PATH_SAMPLES): Vector3[] {
  return curveOf(path).getSpacedPoints(samples)
}

/**
 * Which stretch between two control points an abscissa falls in — what a click on the line names.
 *
 * The abscissa is measured by ARC LENGTH, as `pathPoints` samples it, and the segments are not:
 * `getUtoTmapping` is what converts one into the other, and skipping it puts the point in the
 * wrong stretch as soon as two segments differ in length.
 */
export function segmentAt(path: PathDescriptor, u: number): number {
  const spans = path.closed ? path.points.length : path.points.length - 1
  if (spans <= 0) return 0

  const curve = curveOf(path)
  // The distance is passed rather than left out: three defaults it to `u × total length`, which
  // is the same number, but its types declare the parameter required.
  const t = curve.getUtoTmapping(clamp(u, 0, 1), clamp(u, 0, 1) * curve.getLength())
  return clamp(Math.floor(t * spans), 0, spans - 1)
}

/**
 * 🛑 The pair of a NEW anchor is smoothed from its neighbours, never left at zero: a zero pair is
 * a corner, and a point posed mid-curve would kink it where the click was made.
 */
function withPoints(path: PathDescriptor, points: readonly PlainVector3[]): PathDescriptor {
  if (path.kind !== 'bezier') return { ...path, points }

  const smoothed = bezierPathOf(points, path.closed)
  const handles = points.map((point, at) => {
    const held = path.points.indexOf(point)
    return held >= 0 ? path.handles[held]! : handleAt(smoothed, at)
  })
  return { ...path, points, handles }
}

/** One control point moved. The same descriptor back when the index names none. */
export function withMovedPoint(
  path: PathDescriptor,
  index: number,
  point: PlainVector3,
): PathDescriptor {
  if (index < 0 || index >= path.points.length) return path
  // The anchors alone move: the tangents are RELATIVE to theirs, so they travel with it.
  return { ...path, points: path.points.map((held, at) => (at === index ? point : held)) }
}

/**
 * 🛑 Stored RELATIVE to the anchor — a handle is drawn at anchor + tangent, so an absolute place
 * would make every tangent slide the day its anchor moved.
 */
export function withMovedHandle(
  path: PathDescriptor,
  index: number,
  part: 'in' | 'out',
  at: PlainVector3,
): PathDescriptor {
  const anchor = path.points[index]
  if (path.kind !== 'bezier' || !anchor || index >= path.handles.length) return path

  const reach = { x: at.x - anchor.x, y: at.y - anchor.y, z: at.z - anchor.z }
  return {
    ...path,
    handles: path.handles.map((held, one) => (one === index ? { ...held, [part]: reach } : held)),
  }
}

/**
 * A control point added after that one, halfway to its neighbour — where an eye expects it.
 *
 * Halfway along the STRAIGHT line between the two, not along the curve: a point placed on the
 * curve would change nothing of the shape, which reads as a click that did nothing.
 */
export function withPointAfter(path: PathDescriptor, index: number): PathDescriptor {
  const from = path.points[index]
  // The neighbour folds back to the first point past the end, and `from` proves there is one.
  const to = path.points[index + 1] ?? path.points[0]
  if (!from || !to) return path

  const points = [...path.points]
  points.splice(index + 1, 0, {
    x: (from.x + to.x) / 2,
    y: (from.y + to.y) / 2,
    z: (from.z + to.z) / 2,
  })
  return withPoints(path, points)
}

/**
 * A control point posed at the END of a rail, which is all a panel with nothing to aim at can
 * offer. An open rail is EXTENDED, half its last span further along it — `withPointAfter` on the
 * last point would fold back to the first and lay the point in the MIDDLE of the line instead.
 * A closed rail has no end, so the span that comes back to its first point takes the insertion.
 */
export function withPointAtEnd(path: PathDescriptor): PathDescriptor {
  const last = path.points.length - 1
  if (path.closed) return withPointAfter(path, last)

  const from = path.points[last - 1]
  const to = path.points[last]
  if (!from || !to) return path

  return withPointAppended(path, {
    x: to.x + (to.x - from.x) / 2,
    y: to.y + (to.y - from.y) / 2,
    z: to.z + (to.z - from.z) / 2,
  })
}

/**
 * A control point laid at a place that was AIMED at, past the last one — what a click in the
 * viewport adds. `withPointAtEnd` guesses where instead, which is all a panel can do.
 */
export function withPointAppended(path: PathDescriptor, point: PlainVector3): PathDescriptor {
  if (!path.closed) return withPoints(path, [...path.points, point])

  // 🛑 A CLOSED run has no end: appended to the list, a point aimed at anywhere but the seam made
  // the run leave its last anchor, cross the loop to reach it, and come back — a knot, measured
  // on screen. It goes into the SPAN it falls in, which is where the eye put it.
  const points = [...path.points]
  points.splice(nearestSpan(path, point) + 1, 0, point)
  return withPoints(path, points)
}

/** Reused rather than minted per span: this runs once per anchor for every point posed. */
const SPAN = new Line3()
const SPAN_FROM = new Vector3()
const SPAN_TO = new Vector3()
const SPAN_AT = new Vector3()
const SPAN_NEAR = new Vector3()

/** Which span of the run a point falls nearest to, by the index of the anchor that opens it. */
function nearestSpan(path: PathDescriptor, point: PlainVector3): number {
  const spans = path.closed ? path.points.length : path.points.length - 1
  let nearest = 0
  let best = Infinity

  for (let at = 0; at < spans; at += 1) {
    const from = path.points[at]!
    const to = path.points[(at + 1) % path.points.length]!
    const gap = distanceToSpan(point, from, to)
    if (gap < best) {
      best = gap
      nearest = at
    }
  }

  return nearest
}

/** One control point taken away. A rail never drops below two: one point is not a line. */
export function withoutPoint(path: PathDescriptor, index: number): PathDescriptor {
  if (path.points.length <= 2 || index < 0 || index >= path.points.length) return path
  return withPoints(
    path,
    path.points.filter((_, at) => at !== index),
  )
}

/** How far a point stands from one span of a run — `Line3` clamps to the ends, which is the point. */
export function distanceToSpan(point: PlainVector3, from: PlainVector3, to: PlainVector3): number {
  return SPAN.set(SPAN_FROM.copy(from), SPAN_TO.copy(to))
    .closestPointToPoint(SPAN_AT.copy(point), true, SPAN_NEAR)
    .distanceTo(SPAN_AT)
}

/**
 * 🛑 How tightly a run turns at one of its points — the circumscribed circle of the point and its
 * two neighbours `reach` samples away. `Infinity` where the three are collinear, which is straight.
 */
export function turnRadiusAt(run: readonly PlainVector3[], at: number, reach: number): number {
  const before = run[(at - reach + run.length) % run.length]!
  const here = run[at]!
  const after = run[(at + reach) % run.length]!
  const area =
    Math.abs(
      (here.x - before.x) * (after.z - before.z) - (after.x - before.x) * (here.z - before.z),
    ) / 2

  if (area < 1e-9) return Infinity
  return (
    (Math.hypot(here.x - before.x, here.z - before.z) *
      Math.hypot(after.x - here.x, after.z - here.z) *
      Math.hypot(after.x - before.x, after.z - before.z)) /
    (4 * area)
  )
}
