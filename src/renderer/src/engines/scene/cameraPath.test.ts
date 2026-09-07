import { describe, expect, it } from 'vitest'
import { bezierPathOf, DEFAULT_PATH, handlesMatch, type PathDescriptor } from '@shared/domain/scene'
import {
  curveOf,
  pathPoints,
  segmentAt,
  withMovedPoint,
  withPointAfter,
  withPointAppended,
  withPointAtEnd,
  withoutPoint,
} from './cameraPath'

const pathOf = (points: PathDescriptor['points']): PathDescriptor => ({ ...DEFAULT_PATH, points })

const at = (x: number) => ({ x, y: 0, z: 0 })

describe('the curve of a rail', () => {
  // Rebuilding it per frame would walk the whole curve for arc lengths that have not changed.
  it('hands back the same curve while the descriptor is the same object', () => {
    const path = pathOf([at(0), at(10)])
    expect(curveOf(path)).toBe(curveOf(path))
  })

  it('builds another one for a rail whose points moved', () => {
    expect(curveOf(pathOf([at(0), at(10)]))).not.toBe(curveOf(pathOf([at(0), at(20)])))
  })

  it('samples the line it draws, in order, from end to end', () => {
    const drawn = pathPoints(pathOf([at(0), at(10)]), 4)

    expect(drawn).toHaveLength(5)
    expect(drawn[0]?.x).toBeCloseTo(0, 3)
    expect(drawn.at(-1)?.x).toBeCloseTo(10, 3)
  })
})

describe('the stretch of rail an abscissa falls in', () => {
  // Three points, two stretches, the second one three times as long as the first: measured by
  // arc length, the middle point stands a quarter of the way along and not halfway.
  const uneven = pathOf([at(0), at(10), at(40)])

  it('names the stretch before the middle point for an abscissa short of it', () => {
    expect(segmentAt(uneven, 0.1)).toBe(0)
  })

  it('names the stretch after it for an abscissa past it', () => {
    expect(segmentAt(uneven, 0.5)).toBe(1)
  })

  // The straight-line reading would answer 1 here — half of the rail's extent is past the middle
  // point — and pose the new point in the wrong stretch.
  it('reads the abscissa by arc length rather than by extent', () => {
    expect(segmentAt(uneven, 0.24)).toBe(0)
  })

  it('holds the last stretch for the very end of the rail', () => {
    expect(segmentAt(uneven, 1)).toBe(1)
  })

  it('gives a closed rail one stretch more, the one that comes back to the first point', () => {
    expect(segmentAt({ ...uneven, closed: true }, 0.99)).toBe(2)
  })
})

describe('editing the points of a rail', () => {
  const three = pathOf([at(0), at(10), at(20)])

  it('moves one point and leaves the others where they stand', () => {
    expect(withMovedPoint(three, 1, at(5)).points.map(point => point.x)).toEqual([0, 5, 20])
  })

  it('leaves the rail alone for an index no point answers to', () => {
    expect(withMovedPoint(three, 9, at(5))).toBe(three)
  })

  // Halfway along the STRAIGHT line, not along the curve: a point placed on the curve would
  // change nothing of the shape, which reads as a click that did nothing.
  it('adds a point halfway to the next one', () => {
    expect(withPointAfter(three, 0).points.map(point => point.x)).toEqual([0, 5, 10, 20])
  })

  it('adds a point after the last one by folding back to the first', () => {
    expect(withPointAfter(three, 2).points.map(point => point.x)).toEqual([0, 10, 20, 10])
  })

  /**
   * The gesture of the panel, which has no stretch of line to aim at. Its own case, because
   * `withPointAfter` on the last point does something else entirely on an OPEN rail.
   */
  it('extends an open rail past its last point, by half its last span', () => {
    expect(withPointAtEnd(three).points.map(point => point.x)).toEqual([0, 10, 20, 25])
  })

  it('lays a point in the span that comes back to the first point of a closed rail', () => {
    const closed = { ...pathOf([at(0), at(10), at(20)]), closed: true }

    expect(withPointAtEnd(closed).points.map(point => point.x)).toEqual([0, 10, 20, 10])
  })

  /**
   * The gesture of the viewport: a place was AIMED at, so nothing is guessed about where.
   *
   * 🛑 A CLOSED run has no end, so the point goes into the SPAN it falls in rather than onto the
   * end of the list: appended there, the run left its last anchor, crossed the loop to reach the
   * point and came back — a knot, measured on screen.
   */
  it('appends a point exactly where a click named, in the span it falls in', () => {
    expect(withPointAppended(three, at(7)).points.map(point => point.x)).toEqual([0, 10, 20, 7])

    const closed = { ...three, closed: true }
    expect(withPointAppended(closed, at(7)).points.map(point => point.x)).toEqual([0, 7, 10, 20])
  })

  it('drops a point', () => {
    expect(withoutPoint(three, 1).points.map(point => point.x)).toEqual([0, 20])
  })

  // One point is not a line: a rail that could be emptied would be a node drawing nothing.
  it('refuses to drop below two points', () => {
    const two = pathOf([at(0), at(10)])
    expect(withoutPoint(two, 0)).toBe(two)
  })
})

describe('a Bézier rail', () => {
  const at = (x: number, z: number) => ({ x, y: 0, z })
  const square = [at(-5, -5), at(5, -5), at(5, 5), at(-5, 5)]

  /** 🛑 The conversion must be invisible: a rail that jumps when handles are turned on is a rail
   * nobody dares turn them on for. */
  it('keeps the shape a smooth rail already had', () => {
    const smooth: PathDescriptor = { ...DEFAULT_PATH, points: square, closed: true }
    const bezier = bezierPathOf(square, true)

    for (const along of [0.1, 0.35, 0.6, 0.85]) {
      const one = curveOf(smooth).getPointAt(along)
      const other = curveOf(bezier).getPointAt(along)
      // Within a tenth of a metre on a ten-metre square: the two parameterisations differ, the
      // shape does not.
      expect(one.distanceTo(other)).toBeLessThan(0.1)
    }
  })

  /** The point of the whole thing: a tangent turned changes the curve, and only near its anchor. */
  it('bends where a tangent is turned', () => {
    const before = bezierPathOf(square, true)
    const turned: PathDescriptor = {
      ...before,
      kind: 'bezier',
      handles:
        before.kind === 'bezier'
          ? before.handles.map((held, at) =>
              at === 1 ? { in: held.in, out: { x: 0, y: 6, z: 0 } } : held,
            )
          : [],
    }

    expect(curveOf(turned).getPointAt(0.3).y).toBeGreaterThan(1)
    expect(curveOf(turned).getPointAt(0.8).y).toBeCloseTo(0, 5)
  })

  /** A point posed in a curve must not kink it: its own pair is smoothed from its neighbours. */
  it('smooths the pair of a point it is handed', () => {
    const posed = withPointAfter(bezierPathOf(square, true), 0)
    const pair = posed.kind === 'bezier' ? posed.handles[1] : null

    expect(posed.points).toHaveLength(5)
    expect(posed.kind === 'bezier' ? posed.handles : []).toHaveLength(5)
    expect(Math.hypot(pair?.out.x ?? 0, pair?.out.z ?? 0)).toBeGreaterThan(0)
  })

  /** A pair per anchor, whatever the edit: fewer would draw a curve past its own handles. */
  it('keeps one pair per anchor through every edit', () => {
    const grown = withPointAppended(bezierPathOf(square, false), at(0, 12))
    const cut = withoutPoint(grown, 0)

    expect(handlesMatch(grown)).toBe(true)
    expect(handlesMatch(cut)).toBe(true)
    expect(cut.points).toHaveLength(4)
  })
})

describe('a closed run', () => {
  const at = (x: number) => ({ x, y: 0, z: 0 })
  const loop = (): PathDescriptor => ({
    ...DEFAULT_PATH,
    points: [at(0), at(10), at(20)],
    closed: true,
  })

  /**
   * A triangle, so the spans are told apart: on a run laid along one axis every span is as near
   * as the next, and the reading would say nothing.
   */
  const triangle = (): PathDescriptor => ({
    ...DEFAULT_PATH,
    points: [
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 },
      { x: 5, y: 0, z: 10 },
    ],
    closed: true,
  })

  /** The point goes into the span it FALLS IN — never across the loop and back. */
  it('takes a point into the span nearest to where it was aimed', () => {
    const near = withPointAppended(triangle(), { x: 8, y: 0, z: 6 })

    expect(near.points.map(point => `${point.x},${point.z}`)).toEqual([
      '0,0',
      '10,0',
      '8,6',
      '5,10',
    ])
    // 🛑 And it STAYS closed: posing a point is not a way of unpicking a loop, and only the
    // panel's own toggle opens one.
    expect(near.closed).toBe(true)
  })

  /** The panel's own button poses on it too, halfway along the span that comes back round. */
  it('still takes a point posed by the panel', () => {
    expect(withPointAtEnd(loop()).points.map(point => point.x)).toEqual([0, 10, 20, 10])
  })

  it('takes a point posed in a span of it', () => {
    expect(withPointAfter(loop(), 0).points.map(point => point.x)).toEqual([0, 5, 10, 20])
  })
})

describe('turning an OPEN run into a Bézier one', () => {
  const at = (x: number, z: number) => ({ x, y: 0, z })
  const bend = [at(0, 0), at(5, 0), at(5, 5)]

  /**
   * 🛑 An open run has no neighbour past its ends: wrapped round, the first anchor took its
   * tangent from the LAST one and the curve left the shape it was meant to keep — measured at
   * 0,34 unit off, right after the anchor.
   */
  it('keeps the shape a smooth open rail already had', () => {
    const smooth: PathDescriptor = { ...DEFAULT_PATH, points: bend, closed: false }

    for (const along of [0.05, 0.2, 0.5, 0.8]) {
      const one = curveOf(smooth).getPointAt(along)
      const other = curveOf(bezierPathOf(bend, false)).getPointAt(along)
      expect(one.distanceTo(other)).toBeLessThan(0.1)
    }
  })
})
