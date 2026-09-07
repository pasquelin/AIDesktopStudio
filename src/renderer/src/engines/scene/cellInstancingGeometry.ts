import {
  Box3,
  Frustum,
  InstancedMesh,
  Matrix4,
  OrthographicCamera,
  PerspectiveCamera,
  Vector3,
  type BufferGeometry,
  type Camera,
  type Group,
  type Material,
  type Mesh,
} from 'three'
import { movesOnItsOwn } from '@shared/domain/component'
import { toRadians } from '@shared/domain/angles'
import { worldReach, type Grouped, type ShadowThrow } from './grouping'
import { MAX_SPATIAL_REACH, type CellKey, type WorldPartition } from './worldPartition'

export type Bucket = {
  /** The map it hangs in — its group's own, so dropping it needs no lookup by name. */
  owner: Map<CellKey | null, Bucket>
  cell: CellKey | null
  ids: string[]
  mesh: InstancedMesh
  key: string
  paint: Material | Material[]
  /** The pass that last settled it — see `buckets`. */
  seenAt: number
}

/**
 * The lot of one group's MOVERS, hung straight from the host.
 *
 * No cell, no zone, no box: a body that moves goes anywhere, and the whole point is that nothing
 * it does ever rebuilds a static cell. Measured in C5-B2 on 5 014 movers of 500 000: 0.901 ms an
 * update against 19.10 in a single structure, and zero mesh rebuilt against 947.
 */
export type Mobile = { mesh: InstancedMesh; ids: string[]; paint: Material | Material[] }

/** A cell in the scene: its group, the box its lots together occupy, and whether that box holds. */
export type Held = { group: Group; box: Box3; stale: boolean }

/** The union of what its lots occupy, recomposed only when a rebuild touched the cell. */
export function remeasure(held: Held, boxes: WeakMap<InstancedMesh, Box3>): void {
  held.box.makeEmpty()
  for (const child of held.group.children) {
    const box = child instanceof InstancedMesh ? boxes.get(child) : undefined
    if (box) held.box.union(box)
    // A lot with no box of its own makes the cell's unbounded: it must never hide anything.
    else held.box.set(NOWHERE.min, NOWHERE.max)
  }
  held.stale = false
}

/** What an unmeasured lot leaves its cell: a box nothing can be outside of. */
const NOWHERE = new Box3(
  new Vector3(-Infinity, -Infinity, -Infinity),
  new Vector3(Infinity, Infinity, Infinity),
)

export type Members = { ids: string[]; meshes: Mesh[] }

/**
 * The bodies of one group, filed under the cell each stands in — and under one loose lot for
 * those too big for any, which are drawn wherever the camera is.
 */
export function splitByCell(
  worn: Grouped,
  index: WorldPartition,
  shape: BufferGeometry,
  seen: Map<string, string>,
  movers: Members,
  promoted: ReadonlySet<string>,
): Map<CellKey | null, Members> {
  const held = new Map<CellKey | null, Members>()
  for (const [at, mesh] of worn.meshes.entries()) {
    const id = worn.ids[at]
    if (id === undefined) continue
    // 🛑 DECLARED, not deduced: what the document says a body does is read off the node, once per
    // rebuild. Putting a mover back in a cell would rebuild that cell on every change of content.
    if (promoted.has(id) || movesOnItsOwn(worn.nodes[at]?.components)) {
      seen.set(id, worn.key)
      movers.ids.push(id)
      movers.meshes.push(mesh)
      continue
    }
    // The translation read straight off the world matrix, never `decompose`: a non-uniform scale
    // inside a rotated parent shears, and a decomposed translation of a sheared matrix drifts.
    const stands = mesh.matrixWorld.elements
    const spills = worldReach(shape, mesh.matrixWorld) > MAX_SPATIAL_REACH
    // Filed under the cell ITSELF, never under a name: naming here spelled and hashed one string
    // per body, 5 000 of them a rebuild on 5 000 bodies.
    const cell = spills ? null : index.cellAt(stands[12] ?? 0, stands[14] ?? 0)
    const inside = held.get(cell)
    if (inside) {
      inside.ids.push(id)
      inside.meshes.push(mesh)
    } else held.set(cell, { ids: [id], meshes: [mesh] })
  }
  return held
}

export const FRUSTUM = new Frustum()
export const VIEW = new Matrix4()
const CORNER = new Vector3()
export const EYE = new Vector3()
export const AT = new Matrix4()
const SWEPT = new Box3()
const LANDED = new Box3()

/**
 * The box grown by where its own shadow can fall — hiding a caster hides its shadow with it.
 *
 * The union of the box and the box dropped onto the floor along the light: the swept volume is
 * their hull, which that union contains.
 */
export function sweptBy(box: Box3, cast: ShadowThrow | null | undefined): Box3 {
  if (!cast || box.isEmpty()) return box
  const drop = box.max.y - cast.floor
  if (drop <= 0) return box
  SWEPT.copy(box)
  for (const along of cast.along) {
    // A light at or above the horizon throws nothing that lands.
    if (along.y >= 0) continue
    const far = Math.min(drop / -along.y, cast.reach)
    LANDED.copy(box).translate(CORNER.set(along.x * far, -drop, along.z * far))
    SWEPT.union(LANDED)
  }
  return SWEPT
}

/** The box the bodies of a bucket occupy, each grown by its own reach. */
export function boxOf(meshes: readonly Mesh[], shape: BufferGeometry): Box3 {
  const box = new Box3()
  for (const mesh of meshes) grow(box, mesh.matrixWorld, worldReach(shape, mesh.matrixWorld))
  return box
}

/** Takes in where a body stands, and how far what it draws reaches around that. */
export function grow(box: Box3, placement: Matrix4, reach: number): void {
  box.expandByPoint(CORNER.setFromMatrixPosition(placement).addScalar(reach))
  box.expandByPoint(CORNER.setFromMatrixPosition(placement).subScalar(reach))
}

/** Whether it holds the same bodies at all, order aside — the slow half of the check above. */
export function sameSet(held: readonly string[], now: readonly string[]): boolean {
  const known = new Set(now)
  for (const id of held) if (!known.has(id)) return false
  return true
}

/**
 * Writes the matrices of a bucket nothing structural changed in, and marks it only if one moved.
 * A node carried under another parent moves without leaving its cell, so the matrices cannot be
 * trusted; comparing costs the read that writing costs anyway, and saves a whole cell's upload.
 */
export function rewrite(instance: InstancedMesh, sources: readonly (Mesh | undefined)[]): boolean {
  const held = instance.instanceMatrix.array
  let moved = false
  for (let slot = 0; slot < sources.length; slot += 1) {
    const source = sources[slot]
    if (!source || samePlace(held, slot * 16, source.matrixWorld.elements)) continue
    instance.setMatrixAt(slot, source.matrixWorld)
    moved = true
  }
  if (!moved) return false
  instance.instanceMatrix.needsUpdate = true
  instance.computeBoundingSphere()
  return true
}

/**
 * The same, for a bucket whose bodies were REORDERED — a mover taken out of it by a swap. Each
 * slot keeps the body it held, so nothing has to be rebuilt for a change of order.
 */
export function rewriteBy(bucket: Bucket, members: Members): boolean {
  const byId = new Map<string, Mesh>()
  for (const [at, id] of members.ids.entries()) {
    const mesh = members.meshes[at]
    if (mesh) byId.set(id, mesh)
  }
  return rewrite(
    bucket.mesh,
    bucket.ids.map(id => byId.get(id)),
  )
}

/** `fround` because the buffer holds singles: a double compared raw is never equal to its copy. */
export function samePlace(
  held: ArrayLike<number>,
  base: number,
  stands: readonly number[],
): boolean {
  for (let at = 0; at < 16; at += 1) {
    if (held[base + at] !== Math.fround(stands[at] ?? 0)) return false
  }
  return true
}

/**
 * How far a camera can see, as a disc around where it stands: the far CORNER of its volume, never
 * `far` alone — a top view of a level is wider than it is deep, and the disc would cut its sides.
 */
export function seenFrom(camera: Camera): number {
  if (camera instanceof PerspectiveCamera) {
    const high = camera.far * Math.tan(toRadians(camera.fov / 2))
    return Math.hypot(camera.far, high, high * camera.aspect)
  }
  if (camera instanceof OrthographicCamera) {
    return Math.hypot(
      camera.far,
      (camera.right - camera.left) / (2 * camera.zoom),
      (camera.top - camera.bottom) / (2 * camera.zoom),
    )
  }
  return Infinity
}
