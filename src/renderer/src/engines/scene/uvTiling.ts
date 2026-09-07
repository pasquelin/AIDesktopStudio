import type { BufferAttribute, BufferGeometry, InterleavedBufferAttribute } from 'three'
import type { GeometryDescriptor } from '@shared/domain/scene'
import { DEFAULT_TUBE_CURVE } from './threeFactory'

/*
 * Repeating a map at a fixed density — one square of the checker per square metre, on a wall as
 * on a floor. Why a COUNT across the shape cannot do it is written on `tilesPerMetre` itself.
 *
 * Which of the two ways a shape takes depends on what its own UVs mean: FLAT faces are recomputed
 * from position and normal, so the pattern CONTINUES across an edge rather than restarting at it;
 * a surface of REVOLUTION keeps its own UVs, scaled — projecting one would seam it down its side.
 *
 * The node's SCALE is not read: a primitive stretched by its transform wears stretched squares.
 */

/** Metres across, then metres down, that the native UVs of a surface of revolution cover. */
type UvSpan = { u: number; v: number }
type FlatKind =
  | 'box'
  | 'plane'
  | 'circle'
  | 'ring'
  | 'dodecahedron'
  | 'icosahedron'
  | 'octahedron'
  | 'tetrahedron'

export function tileUvs(
  geometry: BufferGeometry,
  descriptor: GeometryDescriptor,
  tilesPerMetre: number,
): void {
  const uv = geometry.attributes.uv
  if (!uv) return

  const span = spanOf(descriptor, geometry)
  if (span) scaleUvs(uv, span, tilesPerMetre)
  else projectUvs(geometry, uv, tilesPerMetre)
}

type UvAttribute = BufferAttribute | InterleavedBufferAttribute

/**
 * `null` for a shape of flat faces, which is projected instead. Exhaustive rather than
 * defaulting: a kind added to the union has to say which way it takes, and the compiler asks.
 */
function spanOf(descriptor: GeometryDescriptor, geometry: BufferGeometry): UvSpan | null {
  if (isFlat(descriptor)) return null
  return curvedSpanOf(descriptor, geometry)
}

function isFlat(
  descriptor: GeometryDescriptor,
): descriptor is Extract<GeometryDescriptor, { kind: FlatKind }> {
  switch (descriptor.kind) {
    case 'box':
    case 'plane':
    case 'circle':
    case 'ring':
    case 'dodecahedron':
    case 'icosahedron':
    case 'octahedron':
    case 'tetrahedron':
      return true
    default:
      return false
  }
}

function curvedSpanOf(
  descriptor: Exclude<GeometryDescriptor, { kind: FlatKind }>,
  geometry: BufferGeometry,
): UvSpan {
  switch (descriptor.kind) {
    case 'ribbon':
      return { u: 1, v: 1 }

    case 'cylinder':
      return {
        u: circumference(Math.max(descriptor.radiusTop, descriptor.radiusBottom)),
        v: descriptor.height,
      }

    case 'sphere':
      return { u: circumference(descriptor.radius), v: Math.PI * descriptor.radius }

    case 'capsule':
      return {
        u: circumference(descriptor.radius),
        v: descriptor.height + Math.PI * descriptor.radius,
      }

    case 'torus':
      return { u: circumference(descriptor.radius), v: circumference(descriptor.tube) }

    case 'torusKnot':
      return {
        u: circumference(descriptor.radius) * descriptor.p,
        v: circumference(descriptor.tube),
      }

    case 'tube':
      return { u: DEFAULT_TUBE_CURVE.getLength(), v: circumference(descriptor.radius) }

    case 'lathe':
      return spanFromBounds(geometry)
  }
}

function circumference(radius: number): number {
  return 2 * Math.PI * radius
}

function spanFromBounds(geometry: BufferGeometry): UvSpan {
  geometry.computeBoundingBox()
  const box = geometry.boundingBox
  if (!box) return { u: 1, v: 1 }

  const width = box.max.x - box.min.x
  const depth = box.max.z - box.min.z
  return { u: circumference(Math.max(width, depth) / 2), v: box.max.y - box.min.y }
}

function scaleUvs(uv: UvAttribute, span: UvSpan, tilesPerMetre: number): void {
  for (let at = 0; at < uv.count; at += 1) {
    uv.setXY(at, uv.getX(at) * span.u * tilesPerMetre, uv.getY(at) * span.v * tilesPerMetre)
  }
  uv.needsUpdate = true
}

/**
 * The origin sits at the CENTRE of a tile, not on the corner of four. Primitives are built around
 * their own centre, so without the half a picture meant to fit once straddles the 0..1 seam and
 * shows its right half on the left — measured on a four-metre plane at a quarter tile per metre.
 */
function centred(along: number, tilesPerMetre: number): number {
  return along * tilesPerMetre + 0.5
}

function projectUvs(geometry: BufferGeometry, uv: UvAttribute, tilesPerMetre: number): void {
  const position = geometry.attributes.position
  const normal = geometry.attributes.normal
  if (!position || !normal) return

  for (let at = 0; at < uv.count; at += 1) {
    const x = position.getX(at)
    const y = position.getY(at)
    const z = position.getZ(at)
    const towardsX = Math.abs(normal.getX(at))
    const towardsY = Math.abs(normal.getY(at))
    const towardsZ = Math.abs(normal.getZ(at))

    // The pair the normal does NOT dominate — a floor is read by x and z, a wall facing X by
    // z and y. Ties go to the later axis, which only ever happens on a 45° face.
    if (towardsY >= towardsX && towardsY >= towardsZ) {
      uv.setXY(at, centred(x, tilesPerMetre), centred(z, tilesPerMetre))
    } else if (towardsX >= towardsZ) {
      uv.setXY(at, centred(z, tilesPerMetre), centred(y, tilesPerMetre))
    } else {
      uv.setXY(at, centred(x, tilesPerMetre), centred(y, tilesPerMetre))
    }
  }
  uv.needsUpdate = true
}
