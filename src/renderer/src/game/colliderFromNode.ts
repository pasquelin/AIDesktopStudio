import { Box3, Matrix4, Vector3, type BufferGeometry } from 'three'
import { isCsgGraph, type CollisionFidelity, type CsgGraph, type CsgPart } from '@shared/domain/csg'
import type { GeometryDescriptor } from '@shared/domain/geometry'
import type { Vector3 as PlainVector3 } from '@shared/domain/transform'
import { HULL_FLOOR, type ColliderShape } from '@game/physics/shape'
import { convexesOfGraph, pointsOf } from '@/engines/csg/convexes'
import { matrixOfTransform } from '@/engines/csg/csgMatrix'
import { geometryFor } from '@/engines/scene/threeFactory'
import type { SceneNode } from '@/engines/scene/sceneState'

/** A plane holds no matter, and physics needs some. Metres — a sheet, not a wall. */
const PLANE_THICKNESS = 0.01

/**
 * `exact` false is a fidelity the studio could not honour — a hull where a pierced wall was
 * wanted. The caller says so, rather than leaving an author to wonder why the window is closed.
 */
export type NodeCollider = { shape: ColliderShape; exact: boolean }

/**
 * What a node is FELT as, derived from what it DRAWS. The scale is baked into the shape: a
 * physics engine holds a pose per body and no scale of its own.
 *
 * 🛑 A `model` gets nothing, and that is a HOLE, not a decision: its geometry comes from a file
 * the loader may not have landed, so an imported prop is walked through. For the prefabs lot.
 */
export function colliderFromNode(node: SceneNode): NodeCollider | null {
  const held = (node.components ?? []).find(component => component.type === 'Collider')
  const said = typeof held?.fidelity === 'string' ? held.fidelity : 'auto'
  const scale = node.transform.scale

  if (node.type === 'carved') return carvedCollider(node.carved, scale, said)
  if (node.type === 'mesh' && !node.instances) return meshCollider(node.geometry, scale, said)
  return null
}

function meshCollider(
  shape: GeometryDescriptor,
  scale: PlainVector3,
  said: string,
): NodeCollider | null {
  if (said === 'box') return boxed(pointsOfShape(shape, scale))
  if (said === 'trimesh') return trimeshed(shape, scale)
  // A primitive IS one convex piece, so asking for `convexes` on one is asking for its hull.
  if (said === 'auto') {
    const exact = primitiveOf(shape, scale)
    if (exact) return { shape: exact, exact: true }
  }
  return hulled(pointsOfShape(shape, scale), true)
}

/**
 * The pieces of a carved solid — exact by construction, or a hull with `exact` false.
 *
 * `auto` reads the fidelity the graph itself carries: ADR-25 took that field while it was free,
 * on a document nothing simulated yet, and this is what finally reads it.
 */
function carvedCollider(graph: CsgGraph, scale: PlainVector3, said: string): NodeCollider | null {
  const fidelity: CollisionFidelity | string = said === 'auto' ? graph.collision : said
  const into = new Matrix4().makeScale(scale.x, scale.y, scale.z)
  const points = brushPoints(graph, into)

  if (fidelity === 'box') return boxed(points)
  if (fidelity === 'hull') return hulled(points, true)

  if (fidelity === 'convexes') {
    const pieces = convexesOfGraph(graph, into)
    const parts = pieces?.map(pointsOf).filter(part => part.length >= HULL_FLOOR * 3) ?? []
    if (parts.length > 0) return { shape: { kind: 'convexes', parts }, exact: true }
  }

  // `trimesh` lands here too: the evaluated mesh is built by a Worker and is not there at the
  // instant a game starts, so what a carved solid falls back on is the hull of its brushes.
  return hulled(points, false)
}

function primitiveOf(shape: GeometryDescriptor, scale: PlainVector3): ColliderShape | null {
  const round = Math.abs(scale.x - scale.z) < 1e-6

  if (shape.kind === 'box') return boxPrimitive(shape, scale)
  if (shape.kind === 'plane') return planePrimitive(shape, scale)
  if (shape.kind === 'sphere' && round && Math.abs(scale.x - scale.y) < 1e-6) {
    return { kind: 'ball', radius: Math.abs(shape.radius * scale.x) }
  }
  if (shape.kind === 'capsule' && round) {
    return {
      kind: 'capsule',
      halfHeight: Math.abs(shape.height * scale.y) / 2,
      radius: Math.abs(shape.radius * scale.x),
    }
  }
  if (shape.kind === 'cylinder' && round) {
    const halfHeight = Math.abs(shape.height * scale.y) / 2
    if (shape.radiusTop === shape.radiusBottom) {
      return { kind: 'cylinder', halfHeight, radius: Math.abs(shape.radiusTop * scale.x) }
    }
    // A cone stands on its base, like three's cylinder with nothing on top.
    if (shape.radiusTop === 0) {
      return { kind: 'cone', halfHeight, radius: Math.abs(shape.radiusBottom * scale.x) }
    }
  }

  return null
}

function boxPrimitive(
  shape: Extract<GeometryDescriptor, { kind: 'box' }>,
  scale: PlainVector3,
): ColliderShape {
  return {
    kind: 'cuboid',
    hx: Math.abs(shape.width * scale.x) / 2,
    hy: Math.abs(shape.height * scale.y) / 2,
    hz: Math.abs(shape.depth * scale.z) / 2,
  }
}

function planePrimitive(
  shape: Extract<GeometryDescriptor, { kind: 'plane' }>,
  scale: PlainVector3,
): ColliderShape {
  return {
    kind: 'cuboid',
    hx: Math.abs(shape.width * scale.x) / 2,
    hy: Math.abs(shape.height * scale.y) / 2,
    hz: PLANE_THICKNESS,
  }
}

const boxed = (points: Float32Array): NodeCollider | null => {
  if (points.length < HULL_FLOOR * 3) return null

  const box = new Box3().setFromArray(points)
  const size = box.getSize(new Vector3())
  const middle = box.getCenter(new Vector3())

  return {
    shape: { kind: 'cuboid', hx: size.x / 2, hy: size.y / 2, hz: size.z / 2, at: middle },
    exact: true,
  }
}

const hulled = (points: Float32Array, exact: boolean): NodeCollider | null =>
  points.length < HULL_FLOOR * 3 ? null : { shape: { kind: 'hull', points }, exact }

function trimeshed(shape: GeometryDescriptor, scale: PlainVector3): NodeCollider | null {
  const geometry = geometryFor(shape)
  geometry.scale(scale.x, scale.y, scale.z)
  const points = positionsOf(geometry)
  const held = geometry.getIndex()
  const indices = held
    ? new Uint32Array(held.array)
    : Uint32Array.from({ length: points.length / 3 }, (_, at) => at)
  geometry.dispose()

  return points.length < 9
    ? null
    : { shape: { kind: 'trimesh', vertices: points, indices }, exact: true }
}

/** The tessellated points of a primitive, scaled. Built and freed at once — three frees nothing. */
function pointsOfShape(shape: GeometryDescriptor, scale: PlainVector3): Float32Array {
  const geometry = geometryFor(shape)
  geometry.scale(scale.x, scale.y, scale.z)
  const points = positionsOf(geometry)
  geometry.dispose()
  return points
}

/**
 * The positions as flat triples, copied off the buffer rather than read through the accessors —
 * `meshVolume.ts` measured those at 0,506 ms against 0,184 on a sphere of 32 512 triangles.
 */
function positionsOf(geometry: BufferGeometry): Float32Array {
  const held = geometry.getAttribute('position').array
  return held instanceof Float32Array ? new Float32Array(held) : Float32Array.from(held)
}

/**
 * Every point a solid is made OF — the base and whatever was united into it, placed.
 *
 * What was SUBTRACTED is left out on purpose: a hull of a pierced wall is the wall, and adding
 * the tool's corners would swell it past the wall it was cut from.
 */
function brushPoints(graph: CsgGraph, into: Matrix4): Float32Array {
  const clouds = [partPoints(graph.base, into)]
  for (const step of graph.steps) {
    if (step.operation === 'unite') clouds.push(partPoints(step.part, into))
  }

  const points = new Float32Array(clouds.reduce((held, cloud) => held + cloud.length, 0))
  let at = 0
  for (const cloud of clouds) {
    points.set(cloud, at)
    at += cloud.length
  }
  return points
}

function partPoints(part: CsgPart, into: Matrix4): Float32Array {
  const placed = new Matrix4().multiplyMatrices(into, matrixOfTransform(part.transform))
  if (isCsgGraph(part.geometry)) return brushPoints(part.geometry, placed)

  const geometry = geometryFor(part.geometry)
  geometry.applyMatrix4(placed)
  const points = positionsOf(geometry)
  geometry.dispose()
  return points
}
