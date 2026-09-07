import {
  Vector3,
  type BufferGeometry,
  type InstancedMesh,
  type Matrix4,
  type Mesh,
  type Object3D,
  type Sphere,
} from 'three'

export type PlacedSlot = { instance: InstancedMesh; slot: number; source: Mesh }
export type Placed = Map<string, PlacedSlot[]>

export function pushSlot(placed: Placed, id: string, slot: PlacedSlot): void {
  const held = placed.get(id)
  if (held) held.push(slot)
  else placed.set(id, [slot])
}

export function dropSlotsOf(placed: Placed, id: string, instance: InstancedMesh): void {
  const held = placed.get(id)
  if (!held) return
  const kept = held.filter(at => at.instance !== instance)
  if (kept.length) placed.set(id, kept)
  else placed.delete(id)
}

export function slotOn(
  placed: Placed,
  id: string,
  instance: InstancedMesh,
): PlacedSlot | undefined {
  return placed.get(id)?.find(at => at.instance === instance)
}

export function writeMoved(
  placed: Placed,
  ids: Iterable<string>,
  objectOf: (id: string) => Object3D | undefined,
): boolean {
  let touched = false
  for (const id of ids) {
    const slots = placed.get(id)
    if (!slots || !objectOf(id)) continue
    for (const at of slots) {
      const placement = at.source.matrixWorld
      at.instance.setMatrixAt(at.slot, placement)
      at.instance.instanceMatrix.addUpdateRange(at.slot * 16, 16)
      at.instance.instanceMatrix.needsUpdate = true
      widen(at.instance.boundingSphere, at.instance.geometry, placement)
      touched = true
    }
  }
  return touched
}

export function worldReach(geometry: BufferGeometry, placement: Matrix4): number {
  if (!geometry.boundingSphere) geometry.computeBoundingSphere()
  const sphere = geometry.boundingSphere
  if (!sphere) return 0
  return (sphere.center.length() + sphere.radius) * stretchOf(placement)
}

function stretchOf(placement: Matrix4): number {
  const at = placement.elements
  let squared = 0
  for (const column of [0, 4, 8]) {
    for (let row = 0; row < 3; row += 1) squared += (at[column + row] ?? 0) ** 2
  }
  return Math.sqrt(squared)
}

const REACHED = new Vector3()

export function widen(bounds: Sphere | null, geometry: BufferGeometry, placement: Matrix4): void {
  if (!bounds) return
  const reach =
    worldReach(geometry, placement) +
    bounds.center.distanceTo(REACHED.setFromMatrixPosition(placement))
  if (reach > bounds.radius) bounds.radius = reach
}

export function isDrawn(mesh: Object3D, host: Object3D): boolean {
  for (let at: Object3D | null = mesh; at && at !== host; at = at.parent) {
    if (!at.visible) return false
  }
  return true
}

export function trianglesOf(geometry: BufferGeometry): number {
  return (geometry.index?.count ?? geometry.getAttribute('position')?.count ?? 0) / 3
}
