// SPDX-License-Identifier: MIT

import type { Vector3 } from '@shared/domain/transform'
import { HULL_FLOOR, type ColliderShape } from '../physics/shape'
import type {
  JoltModule,
  JoltShape,
  JoltShapeSettings,
  JoltVector,
  Scratch,
} from './joltPhysicsTypes'

const CONVEX_RADIUS = 0.05

export function builtShape(
  jolt: JoltModule,
  shape: ColliderShape,
  scratch: Scratch,
): JoltShape | null {
  if (shape.kind === 'hull') return hullOf(jolt, shape.points, scratch)
  if (shape.kind === 'convexes') {
    const pieces = shape.parts.map(points => hullOf(jolt, points, scratch)).filter(one => !!one)
    return pieces.length === 0 ? null : composed(jolt, pieces, null, scratch)
  }
  if (shape.kind === 'cuboid' && shape.at) {
    const box = createdShape(jolt, boxOf(jolt, shape.hx, shape.hy, shape.hz, scratch))
    return box ? composed(jolt, [box], shape.at, scratch) : null
  }
  return createdShape(jolt, leafOf(jolt, shape, scratch))
}

/** The settings go the moment the shape stands: only the shape is reference counted from here. */
function createdShape(jolt: JoltModule, settings: JoltShapeSettings): JoltShape | null {
  const result = settings.Create()
  const made = result.IsValid() ? result.Get() : null
  // Ours until whoever asked has taken its own reference.
  made?.AddRef()
  jolt.destroy(settings)
  return made
}

/**
 * The pieces put together, at an offset for a box read off a bounding box. A compound of ONE is
 * legal and measured — Jolt's own note recommends a rotated-translated shape instead, and that
 * one cannot be built without nesting a settings inside a settings.
 */
function composed(
  jolt: JoltModule,
  pieces: readonly JoltShape[],
  at: Vector3 | null,
  scratch: Scratch,
): JoltShape | null {
  const settings = new jolt.StaticCompoundShapeSettings()
  scratch.vector.Set(at?.x ?? 0, at?.y ?? 0, at?.z ?? 0)
  for (const piece of pieces) settings.AddShapeShape(scratch.vector, scratch.identity, piece, 0)

  const made = createdShape(jolt, settings)
  // The compound took its own references at `Create`; ours have done their work.
  for (const piece of pieces) piece.Release()
  return made
}

const boxOf = (
  jolt: JoltModule,
  hx: number,
  hy: number,
  hz: number,
  scratch: Scratch,
): JoltShapeSettings => {
  scratch.vector.Set(hx, hy, hz)
  return new jolt.BoxShapeSettings(
    scratch.vector,
    Math.min(CONVEX_RADIUS, Math.min(hx, hy, hz) / 2),
  )
}

function leafOf(jolt: JoltModule, shape: ColliderShape, scratch: Scratch): JoltShapeSettings {
  if (shape.kind === 'ball') return new jolt.SphereShapeSettings(shape.radius)
  if (shape.kind === 'capsule') {
    return new jolt.CapsuleShapeSettings(shape.halfHeight, shape.radius)
  }
  if (shape.kind === 'cylinder') {
    const corner = Math.min(CONVEX_RADIUS, shape.radius / 2, shape.halfHeight / 2)
    return new jolt.CylinderShapeSettings(shape.halfHeight, shape.radius, corner)
  }
  // Jolt has no cone: a tapered cylinder closed to a point is the same solid, and its rounded
  // corner goes with it — nothing can round a radius of zero.
  if (shape.kind === 'cone') {
    return new jolt.TaperedCylinderShapeSettings(shape.halfHeight, 0, shape.radius, 0)
  }
  if (shape.kind === 'trimesh') return meshOf(jolt, shape.vertices, shape.indices)
  if (shape.kind === 'heightfield') return heightfieldOf(jolt, shape)
  if (shape.kind === 'cuboid') return boxOf(jolt, shape.hx, shape.hy, shape.hz, scratch)
  // `hull` and `convexes` are built above, where their pieces can be refused one by one.
  throw new Error(`no Jolt shape for ${shape.kind}`)
}

const HEIGHTFIELD_FLOOR = 4
const HEIGHTFIELD_HOLE = 3.4028234663852886e38

function heightfieldOf(
  jolt: JoltModule,
  shape: Extract<ColliderShape, { kind: 'heightfield' }>,
): JoltShapeSettings {
  const count = Math.max(HEIGHTFIELD_FLOOR, shape.width, shape.height)
  const settings = new jolt.HeightFieldShapeSettings()
  settings.mSampleCount = count
  settings.mBitsPerSample = 16
  assignHeightfieldVectors(jolt, settings, shape)
  fillHeightSamples(settings, shape, count)
  return settings
}

function assignHeightfieldVectors(
  jolt: JoltModule,
  settings: InstanceType<JoltModule['HeightFieldShapeSettings']>,
  shape: Extract<ColliderShape, { kind: 'heightfield' }>,
): void {
  const offset = new jolt.Vec3(shape.offset.x, shape.offset.y, shape.offset.z)
  const scale = new jolt.Vec3(shape.scale.x, shape.scale.y, shape.scale.z)
  settings.mOffset = offset
  settings.mScale = scale
  jolt.destroy(offset)
  jolt.destroy(scale)
}

function fillHeightSamples(
  settings: InstanceType<JoltModule['HeightFieldShapeSettings']>,
  shape: Extract<ColliderShape, { kind: 'heightfield' }>,
  count: number,
): void {
  settings.mHeightSamples.reserve(count * count)
  // 🛑 Swept, never collected then spread: `Math.min(...samples)` passes one argument per sample
  // and blows the stack — measured between 100 000 and 131 072 on Node's main thread, 360 000 and
  // 500 000 in a vitest worker. A 1024x1024 relief is past both, and the throw costs its collider.
  let lowest = Infinity
  let highest = -Infinity
  for (let z = 0; z < count; z++)
    for (let x = 0; x < count; x++) {
      const held = x < shape.width && z < shape.height ? shape.heights[z * shape.width + x] : NaN
      const height = Number.isFinite(held) ? (held ?? 0) : HEIGHTFIELD_HOLE
      settings.mHeightSamples.push_back(height)
      if (height === HEIGHTFIELD_HOLE) continue
      lowest = Math.min(lowest, height)
      highest = Math.max(highest, height)
    }
  if (lowest === Infinity) return
  settings.mMinHeightValue = lowest
  settings.mMaxHeightValue = highest
}

/** The generated declarations leave the vectors empty; the build carries their own methods. */
type PointCloud = InstanceType<JoltModule['ArrayVec3']> & {
  push_back: (point: JoltVector) => void
}

/**
 * 🛑 The floor is checked HERE and not left to Jolt: a hull of two points builds a settings object
 * all the same, and it is `Create` that then fails — from inside the WebAssembly, where nothing
 * says which body it was.
 */
function hullOf(jolt: JoltModule, points: Float32Array, scratch: Scratch): JoltShape | null {
  if (points.length < HULL_FLOOR * 3) return null

  const hull = new jolt.ConvexHullShapeSettings()
  // The generated declarations leave `ArrayVec3` empty; the build carries the vector's methods.
  const cloud = hull.mPoints as PointCloud
  for (let at = 0; at + 2 < points.length; at += 3) {
    scratch.vector.Set(points[at] ?? 0, points[at + 1] ?? 0, points[at + 2] ?? 0)
    cloud.push_back(scratch.vector)
  }
  return createdShape(jolt, hull)
}

function meshOf(jolt: JoltModule, vertices: Float32Array, indices: Uint32Array): JoltShapeSettings {
  const points = new jolt.VertexList()
  const triangles = new jolt.IndexedTriangleList()
  const corner = new jolt.Float3(0, 0, 0)
  const triangle = new jolt.IndexedTriangle(0, 0, 0, 0)

  for (let at = 0; at + 2 < vertices.length; at += 3) {
    corner.x = vertices[at] ?? 0
    corner.y = vertices[at + 1] ?? 0
    corner.z = vertices[at + 2] ?? 0
    points.push_back(corner)
  }
  for (let at = 0; at + 2 < indices.length; at += 3) {
    triangle.set_mIdx(0, indices[at] ?? 0)
    triangle.set_mIdx(1, indices[at + 1] ?? 0)
    triangle.set_mIdx(2, indices[at + 2] ?? 0)
    triangles.push_back(triangle)
  }

  const materials = new jolt.PhysicsMaterialList()
  const settings = new jolt.MeshShapeSettings(points, triangles, materials)
  for (const one of [points, triangles, corner, triangle, materials]) jolt.destroy(one)
  return settings
}
