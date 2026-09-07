import { Box3, Matrix3, Matrix4, Plane, Vector3, type BufferGeometry } from 'three'
import { isCsgGraph, type CsgGraph, type CsgPart } from '@shared/domain/csg'
import type { GeometryDescriptor } from '@shared/domain/geometry'
import { geometryFor } from '../scene/threeFactory'
import { matrixOfTransform } from './csgMatrix'

/**
 * A convex solid as the half-spaces that bound it — `three.Plane`, so a placement is one
 * `applyMatrix4` rather than a normal matrix written by hand.
 */
export type Polytope = readonly Plane[]

/**
 * The shapes this reads as a convex solid. Every other primitive is left out ON PURPOSE: the
 * half-spaces are read off the TRIANGLES, and for a torus that set bounds a region the shape
 * never occupied. A `circle` and a `ring` are convex and hold no volume, which is the same
 * refusal for another reason.
 */
const CONVEX_KINDS: readonly GeometryDescriptor['kind'][] = [
  'box',
  'capsule',
  'cylinder',
  'dodecahedron',
  'icosahedron',
  'octahedron',
  'sphere',
  'tetrahedron',
]

/** Two planes closer than this describe one face of a tessellated solid. */
const PLANE_GRAIN = 1e-4

/** How far outside a bounding plane a corner may sit and still be one of the solid's. */
const INSIDE_SLACK = 1e-5

/** Under this on any axis, a piece is a face rather than a solid — clipping makes those. */
const FLAT = 1e-4

/**
 * 🛑 How many faces a solid may have before this refuses to read it as a polytope.
 *
 * `cornersOf` walks every TRIPLE of planes, so it is cubic: a default sphere folds to some nine
 * hundred faces, which is 1,2 × 10⁸ triples and a renderer thread that never comes back. The
 * caller falls back on a hull.
 */
export const CONVEXES_CAP = 32

/**
 * 🛑 And how many a PIECE may reach. Each subtraction adds up to a tool's worth of planes to
 * every piece, so ten windows in one wall reach some sixty-six — cubed, inside the first step of
 * a game, on the renderer thread.
 */
const PIECE_FACES_CAP = 64

/**
 * 🛑 The exact decomposition of ADR-25: the brushes are already convex, so `A − B` is A CLIPPED
 * by each plane of B — piece *i* being A, outside plane *i*, inside planes 1…*i−1*. Disjoint,
 * and it loses nothing. Nothing back when the recipe passes `CONVEXES_CAP` pieces or rests on a
 * brush this cannot read: the caller falls back on a hull and SAYS so.
 */
export function convexesOfGraph(graph: CsgGraph, into: Matrix4): Polytope[] | null {
  const base = polytopesOfPart(graph.base, into)
  if (!base) return null

  let pieces = base
  for (const step of graph.steps) {
    const tool = polytopesOfPart(step.part, into)
    if (!tool) return null

    if (step.operation === 'unite') pieces = [...pieces, ...tool]
    else if (step.operation === 'intersect') pieces = intersected(pieces, tool)
    else {
      // A ∖ (B₁ ∪ B₂) is (A ∖ B₁) ∖ B₂ — which is how a tool that is itself a solid is subtracted.
      for (const one of tool) {
        const cut = subtractConvex(pieces, one)
        if (!cut) return null
        pieces = cut
      }
    }
    if (pieces.length > CONVEXES_CAP) return null
  }

  return pieces
}

/** One brush as polytopes: a primitive gives one, a folded recipe gives whatever it decomposes to. */
function polytopesOfPart(part: CsgPart, into: Matrix4): Polytope[] | null {
  const placed = new Matrix4().multiplyMatrices(into, matrixOfTransform(part.transform))
  if (isCsgGraph(part.geometry)) return convexesOfGraph(part.geometry, placed)

  const polytope = polytopeOf(part.geometry)
  return polytope ? [movedPolytope(polytope, placed)] : null
}

/** The half-spaces of a convex primitive, in its own frame. Nothing for a shape that is not one. */
export function polytopeOf(shape: GeometryDescriptor): Polytope | null {
  if (!CONVEX_KINDS.includes(shape.kind)) return null

  const geometry = geometryFor(shape)
  const planes = planesOf(geometry)
  // Built for its triangles and read once: three.js frees nothing on its own.
  geometry.dispose()
  return planes.length >= 4 && planes.length <= CONVEXES_CAP ? planes : null
}

function movedPolytope(planes: Polytope, matrix: Matrix4): Polytope {
  const normals = new Matrix3().getNormalMatrix(matrix)
  return planes.map(plane => plane.clone().applyMatrix4(matrix, normals))
}

/**
 * Where a polytope's faces meet. Every TRIPLE of planes rather than a face walk: the count is
 * small by construction, and a face structure would have to survive every clip.
 */
export function cornersOf(planes: Polytope): Vector3[] {
  const held = corners.get(planes)
  if (held) return held

  const found: Vector3[] = []

  for (let one = 0; one < planes.length; one++) {
    for (let two = one + 1; two < planes.length; two++) {
      for (let three = two + 1; three < planes.length; three++) {
        const corner = meetOf(planes[one], planes[two], planes[three])
        if (!corner) continue
        if (planes.some(plane => plane.distanceToPoint(corner) > INSIDE_SLACK)) continue
        if (found.some(held => held.distanceToSquared(corner) < PLANE_GRAIN * PLANE_GRAIN)) continue
        found.push(corner)
      }
    }
  }

  corners.set(planes, found)
  return found
}

/**
 * 🛑 Held per polytope: `encloses` reads the corners to decide whether a piece holds matter, and
 * `pointsOf` reads the same ones again to hand them over. Without this the cubic walk runs twice
 * for every piece kept.
 */
const corners = new WeakMap<Polytope, Vector3[]>()

export function pointsOf(planes: Polytope): Float32Array {
  const corners = cornersOf(planes)
  const points = new Float32Array(corners.length * 3)
  for (let index = 0; index < corners.length; index++) {
    corners[index]?.toArray(points, index * 3)
  }
  return points
}

/** The pieces of `from` that lie OUTSIDE `tool`: at most one per plane of the tool, and exact. */
export function subtractConvex(from: readonly Polytope[], tool: Polytope): Polytope[] | null {
  // 🛑 The tool's plane count IS the piece count per solid, so a sphere of 512 faces would ask
  // for 512 colliders. Refused rather than capped mid-way, which would carve half a hole.
  if (tool.length === 0 || tool.length > CONVEXES_CAP) return null

  const pieces: Polytope[] = []
  for (const solid of from) {
    if (solid.length + tool.length > PIECE_FACES_CAP) return null

    for (let index = 0; index < tool.length; index++) {
      const cut = tool[index]
      if (!cut) continue
      const piece = [...solid, flipped(cut)]
      for (let held = 0; held < index; held++) {
        const kept = tool[held]
        if (kept) piece.push(kept)
      }
      if (encloses(piece)) pieces.push(piece)
      if (pieces.length > CONVEXES_CAP) return null
    }
  }

  return pieces
}

const intersected = (from: readonly Polytope[], tool: readonly Polytope[]): Polytope[] =>
  from.flatMap(solid => tool.map(one => [...solid, ...one])).filter(encloses)

const flipped = (plane: Plane): Plane => new Plane(plane.normal.clone().negate(), -plane.constant)

/**
 * Whether a piece holds matter. Measured on the corners' BOX, which lets a thin diagonal sliver
 * through — a piece the physics then refuses or builds as a collider too small to feel. The reverse
 * mistake, dropping a real piece, would open a hole in a wall.
 */
function encloses(planes: Polytope): boolean {
  const found = cornersOf(planes)
  if (found.length < 4) return false

  const size = new Box3().setFromPoints(found).getSize(new Vector3())
  return size.x > FLAT && size.y > FLAT && size.z > FLAT
}

/**
 * One plane per FACE, read off the triangles and folded together.
 *
 * A tessellated box hands over twelve triangles and six faces; the fold is what makes the count
 * of pieces a subtraction produces the count a person would expect.
 */
function planesOf(geometry: BufferGeometry): Plane[] {
  const position = geometry.getAttribute('position')
  const index = geometry.getIndex()
  const count = index ? index.count : position.count
  const planes: Plane[] = []

  const first = new Vector3()
  const second = new Vector3()
  const third = new Vector3()

  for (let at = 0; at < count; at += 3) {
    const one = index ? index.getX(at) : at
    const two = index ? index.getX(at + 1) : at + 1
    const three = index ? index.getX(at + 2) : at + 2
    first.fromBufferAttribute(position, one)
    second.fromBufferAttribute(position, two)
    third.fromBufferAttribute(position, three)

    const plane = new Plane().setFromCoplanarPoints(first, second, third)
    if (!Number.isFinite(plane.constant) || plane.normal.lengthSq() < 0.5) continue
    if (planes.some(held => alike(held, plane))) continue
    planes.push(plane)
  }

  return planes
}

const alike = (one: Plane, other: Plane): boolean =>
  Math.abs(one.constant - other.constant) < PLANE_GRAIN &&
  one.normal.distanceToSquared(other.normal) < PLANE_GRAIN * PLANE_GRAIN

/** Where three planes meet, or nothing when two of them are parallel — or one is missing. */
function meetOf(one?: Plane, two?: Plane, three?: Plane): Vector3 | null {
  if (!one || !two || !three) return null

  const across = new Vector3().crossVectors(two.normal, three.normal)
  const volume = one.normal.dot(across)
  if (Math.abs(volume) < 1e-9) return null

  return across
    .multiplyScalar(-one.constant)
    .addScaledVector(new Vector3().crossVectors(three.normal, one.normal), -two.constant)
    .addScaledVector(new Vector3().crossVectors(one.normal, two.normal), -three.constant)
    .divideScalar(volume)
}
