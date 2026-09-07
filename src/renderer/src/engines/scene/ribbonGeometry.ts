import { BufferAttribute, BufferGeometry } from 'three'
import type { GeometryDescriptor, PathDescriptor, Vector3 } from '@shared/domain/scene'
import { pathPoints } from './cameraPath'

type Ribbon = Extract<GeometryDescriptor, { kind: 'ribbon' }>

/** Two metres across the joint of a hairpin, and the spike a 170° turn would otherwise raise. */
const MITER_LIMIT = 4

/** One cross-section: where the band's two edges stand, and how far along the run they are. */
type Section = {
  leftX: number
  leftZ: number
  rightX: number
  rightZ: number
  y: number
  along: number
}

/** A band swept along a run, as ONE surface — see `GeometryDescriptor` for why boxes cannot. */
export function ribbonGeometry(ribbon: Ribbon): BufferGeometry {
  const sections = sectionsOf(sampledRun(ribbon.path, ribbon.segments), ribbon)
  const into: Buffers = { position: [], uv: [], index: [] }
  // A run of one point describes no band. Its attributes are still written, empty: a geometry
  // missing `position` throws inside three's own bounds and export passes.
  const links = sections.length < 2 ? 0 : ribbon.path.closed ? sections.length : sections.length - 1

  for (let at = 0; at < links; at += 1) {
    const here = sections[at]!
    const next = sections[(at + 1) % sections.length]!
    // A closed run comes back to its first section, whose `along` is zero: the length of the last
    // link is measured from the run, not read off a section that already wrapped.
    const ahead = next.along > here.along ? next.along : here.along + spanBetween(here, next)
    faces(into, here, next, ahead, ribbon.height)
  }

  if (!ribbon.path.closed && links > 0) {
    caps(into, sections[0]!, sections[sections.length - 1]!, ribbon.height)
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(into.position), 3))
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(into.uv), 2))
  geometry.setIndex(into.index)
  geometry.computeVertexNormals()
  return geometry
}

/** How far apart two sections stand, measured on their centres. */
function spanBetween(here: Section, next: Section): number {
  return Math.hypot(
    (next.leftX + next.rightX - here.leftX - here.rightX) / 2,
    (next.leftZ + next.rightZ - here.leftZ - here.rightZ) / 2,
  )
}

/**
 * Lengthened by 1/cos(θ/2) so two sections meeting at a joint share an edge exactly — capped,
 * a hairpin of 170° raising a spike otherwise.
 */
function sectionsOf(points: readonly Vector3[], ribbon: Ribbon): Section[] {
  const last = points.length - 1
  if (points.length < 2) return []

  const closed = ribbon.path.closed
  const half = ribbon.width / 2
  const sections: Section[] = []
  let along = 0

  for (let at = 0; at <= last; at += 1) {
    const here = points[at]!
    if (at > 0) along += Math.hypot(here.x - points[at - 1]!.x, here.z - points[at - 1]!.z)

    const before = closed || at > 0 ? normalAt(points, at - 1) : null
    const after = closed || at < last ? normalAt(points, at) : null
    const joint = bisector(before, after, reachAt(points, at, half, closed))

    sections.push({
      leftX: here.x + joint.x * half,
      leftZ: here.z + joint.z * half,
      rightX: here.x - joint.x * half,
      rightZ: here.z - joint.z * half,
      y: here.y,
      along,
    })
  }

  return sections
}

/** The left-hand normal of the segment leaving point `at`, wrapping so a closed run has one. */
function normalAt(points: readonly Vector3[], at: number): { x: number; z: number } {
  const from = points[(at + points.length) % points.length]!
  const to = points[(at + 1 + points.length) % points.length]!
  const length = Math.hypot(to.x - from.x, to.z - from.z)
  if (length === 0) return { x: 0, z: 0 }
  return { x: -(to.z - from.z) / length, z: (to.x - from.x) / length }
}

/**
 * 🛑 A closed curve's last sample IS its first: kept, it makes a section of zero length and a
 * normal of nothing at the seam.
 */
export function sampledRun(path: PathDescriptor, segments: number): Vector3[] {
  if (path.points.length < 2) return [...path.points]

  const sampled = pathPoints(path, Math.max(segments, path.points.length))
  const run = path.closed ? sampled.slice(0, -1) : sampled
  return run.map(point => ({ x: point.x, y: point.y, z: point.z }))
}

/**
 * On the BISECTOR at every point, like the band's own edges: shifted along each segment's normal
 * instead, two neighbours land at different distances from the corner between them.
 */
export function offsetRun(
  points: readonly Vector3[],
  distance: number,
  closed: boolean,
): Vector3[] {
  const last = points.length - 1
  return points.map((point, at) => {
    const joint = bisector(
      closed || at > 0 ? normalAt(points, at - 1) : null,
      closed || at < last ? normalAt(points, at) : null,
      reachAt(points, at, distance, closed),
    )
    return { x: point.x + joint.x * distance, y: point.y, z: point.z + joint.z * distance }
  })
}

function bisector(
  before: { x: number; z: number } | null,
  after: { x: number; z: number } | null,
  limit: number,
): { x: number; z: number } {
  if (!before) return after ?? { x: 0, z: 0 }
  if (!after) return before

  const sumX = before.x + after.x
  const sumZ = before.z + after.z
  const length = Math.hypot(sumX, sumZ)
  // A run doubling back on itself: the bisector vanishes, and the segment's own normal is what
  // keeps the band a band rather than a zero-width line.
  if (length < 1e-6) return after

  const unitX = sumX / length
  const unitZ = sumZ / length
  const stretch = Math.min(1 / (unitX * after.x + unitZ * after.z), MITER_LIMIT, limit)
  return { x: unitX * stretch, z: unitZ * stretch }
}

/**
 * 🛑 How far a joint may reach, in multiples of the offset — the SHORTEST segment meeting there,
 * over that offset. `MITER_LIMIT` alone bounds the stretch against the width and not against the
 * run: measured, a one-unit offset on segments of 1 and 0,11 reached 3,03 and folded the band
 * across its own next section.
 *
 * 🛑 NEVER under one, which is why this floors rather than returning the raw ratio: it bounds how
 * far a joint STRETCHES, and below one it narrows the band instead. Sampled every 1,74 m, a 12 m
 * tarmac came out 3,50 m across — 29 % of what it declared.
 */
function reachAt(points: readonly Vector3[], at: number, offset: number, closed: boolean): number {
  if (offset === 0) return MITER_LIMIT

  const last = points.length - 1
  const spanTo = (one: number, other: number): number => {
    if (!closed && (one < 0 || other > last)) return Infinity
    const from = points[(one + points.length) % points.length]!
    const to = points[(other + points.length) % points.length]!
    return Math.hypot(to.x - from.x, to.z - from.z)
  }

  return Math.max(1, Math.min(spanTo(at - 1, at), spanTo(at, at + 1)) / Math.abs(offset))
}

/** The four faces between two sections: the lid, the floor, and a wall each side. */
function faces(into: Buffers, here: Section, next: Section, ahead: number, height: number): void {
  const top = (one: Section) => one.y + height
  const across = Math.hypot(here.leftX - here.rightX, here.leftZ - here.rightZ)

  quad(
    into,
    [here.leftX, top(here), here.leftZ, here.along, across],
    [next.leftX, top(next), next.leftZ, ahead, across],
    [next.rightX, top(next), next.rightZ, ahead, 0],
    [here.rightX, top(here), here.rightZ, here.along, 0],
  )
  quad(
    into,
    [here.rightX, here.y, here.rightZ, here.along, 0],
    [next.rightX, next.y, next.rightZ, ahead, 0],
    [next.leftX, next.y, next.leftZ, ahead, across],
    [here.leftX, here.y, here.leftZ, here.along, across],
  )
  quad(
    into,
    [here.leftX, here.y, here.leftZ, here.along, 0],
    [next.leftX, next.y, next.leftZ, ahead, 0],
    [next.leftX, top(next), next.leftZ, ahead, height],
    [here.leftX, top(here), here.leftZ, here.along, height],
  )
  quad(
    into,
    [here.rightX, top(here), here.rightZ, here.along, height],
    [next.rightX, top(next), next.rightZ, ahead, height],
    [next.rightX, next.y, next.rightZ, ahead, 0],
    [here.rightX, here.y, here.rightZ, here.along, 0],
  )
}

/** The two ends of an open run, so the band is a solid rather than a shell. */
function caps(into: Buffers, first: Section, last: Section, height: number): void {
  quad(
    into,
    [first.rightX, first.y, first.rightZ, 0, 0],
    [first.leftX, first.y, first.leftZ, 0, 0],
    [first.leftX, first.y + height, first.leftZ, 0, height],
    [first.rightX, first.y + height, first.rightZ, 0, height],
  )
  quad(
    into,
    [last.leftX, last.y, last.leftZ, last.along, 0],
    [last.rightX, last.y, last.rightZ, last.along, 0],
    [last.rightX, last.y + height, last.rightZ, last.along, height],
    [last.leftX, last.y + height, last.leftZ, last.along, height],
  )
}

/** Metres, both of them: `spanOf` hands the ribbon a span of one, so a UV IS a distance. */
type Corner = [x: number, y: number, z: number, u: number, v: number]

/** What a band is built into — the three buffers a face writes to. */
type Buffers = { position: number[]; uv: number[]; index: number[] }

/**
 * 🛑 Indexed within a face and never across two: the pair is coplanar, so sharing their corners
 * changes no normal, where one shared with the next face would round the edge off.
 */
function quad(into: Buffers, a: Corner, b: Corner, c: Corner, d: Corner): void {
  const first = into.position.length / 3
  for (const corner of [a, b, c, d]) {
    into.position.push(corner[0], corner[1], corner[2])
    into.uv.push(corner[3], corner[4])
  }
  into.index.push(first, first + 1, first + 2, first, first + 2, first + 3)
}
