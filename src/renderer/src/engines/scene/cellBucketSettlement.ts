import {
  InstancedMesh,
  type Box3,
  type BufferGeometry,
  type Material,
  type Mesh,
  type Object3D,
} from 'three'
import { sameOrder } from '@shared/collections'
import { pushSlot, type Grouped, type Placed } from './grouping'
import {
  boxOf,
  rewrite,
  rewriteBy,
  sameSet,
  type Bucket,
  type Held,
  type Members,
} from './cellInstancingGeometry'
import type { CellKey } from './worldPartition'

type SettlementContext = {
  pass: number
  cells: Map<CellKey, Held>
  placed: Placed
  boxes: WeakMap<InstancedMesh, Box3>
  owners: WeakMap<InstancedMesh, Held>
  bucketOf: WeakMap<InstancedMesh, Bucket>
  drop: (bucket: Bucket) => void
  groupOf: (cell: CellKey | null) => Object3D
  markListStale: () => void
}

export function settleCellBucket(
  context: SettlementContext,
  into: Map<CellKey | null, Bucket>,
  cell: CellKey | null,
  members: Members,
  worn: Grouped,
  shape: BufferGeometry,
): void {
  const held = into.get(cell)
  if (held && reuseCellBucket(context, held, cell, members, shape)) return
  if (held) context.drop(held)
  createCellBucket(context, into, cell, members, worn, shape)
}

function reuseCellBucket(
  context: SettlementContext,
  held: Bucket,
  cell: CellKey | null,
  members: Members,
  shape: BufferGeometry,
): boolean {
  if (held.ids.length !== members.ids.length) return false
  const moved = sameOrder(held.ids, members.ids)
    ? rewrite(held.mesh, members.meshes)
    : sameSet(held.ids, members.ids)
      ? rewriteBy(held, members)
      : null
  if (moved === null) return false
  held.seenAt = context.pass
  if (!moved) return true
  context.boxes.set(held.mesh, boxOf(members.meshes, shape))
  const itsCell = cell === null ? undefined : context.cells.get(cell)
  if (itsCell) itsCell.stale = true
  return true
}

function createCellBucket(
  context: SettlementContext,
  into: Map<CellKey | null, Bucket>,
  cell: CellKey | null,
  members: Members,
  worn: Grouped,
  shape: BufferGeometry,
): void {
  const first = members.meshes[0]
  if (!first) return
  const mesh = configuredMesh(shape, worn.material, members.meshes)
  for (const [slot, source] of members.meshes.entries()) {
    const id = members.ids[slot]
    if (id) pushSlot(context.placed, id, { instance: mesh, slot, source })
  }
  context.boxes.set(mesh, boxOf(members.meshes, shape))
  const bucket: Bucket = {
    cell,
    ids: members.ids,
    mesh,
    key: worn.key,
    paint: worn.material,
    seenAt: context.pass,
    owner: into,
  }
  context.bucketOf.set(mesh, bucket)
  const cellGroup = context.groupOf(cell)
  const standingCell = cell === null ? undefined : context.cells.get(cell)
  if (standingCell) context.owners.set(mesh, standingCell)
  cellGroup.add(mesh)
  into.set(cell, bucket)
  context.markListStale()
}

function configuredMesh(
  shape: BufferGeometry,
  material: Material | Material[],
  sources: readonly Mesh[],
): InstancedMesh {
  const mesh = new InstancedMesh(shape, material, sources.length)
  mesh.matrixAutoUpdate = false
  mesh.castShadow = sources[0]?.castShadow ?? false
  mesh.receiveShadow = sources[0]?.receiveShadow ?? false
  for (const [slot, source] of sources.entries()) mesh.setMatrixAt(slot, source.matrixWorld)
  mesh.instanceMatrix.needsUpdate = true
  mesh.computeBoundingSphere()
  return mesh
}
