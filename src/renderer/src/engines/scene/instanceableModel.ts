import { Mesh, SkinnedMesh, type AnimationClip, type Object3D } from 'three'
import { stableKey } from '@shared/hash'
import type { RigStatus } from './rigState'
import type { SceneNode } from './sceneState'

const INSTANCEABLE = new WeakSet<Object3D>()

/**
 * A model the grouping may draw as instances: a static mesh, no dress, no clip of its own or
 * of the file. Skinned, animated, or dressed nodes stay on the clone path.
 */
export function instanceableOf(
  node: SceneNode,
  rig: { status: RigStatus },
  fileClips: readonly AnimationClip[],
): boolean {
  if (node.type !== 'model') return false
  if (rig.status !== 'staticMesh') return false
  if (node.model.dress) return false
  if (fileClips.length > 0) return false
  return !node.model.lanes?.some(lane => lane.clips.length > 0)
}

export function markInstanceable(holder: Object3D, eligible: boolean): void {
  if (eligible) INSTANCEABLE.add(holder)
  else INSTANCEABLE.delete(holder)
}

export function isInstanceable(holder: Object3D): boolean {
  return INSTANCEABLE.has(holder)
}

/** The drawable primitives of a holder, in tree order, skinned meshes left out. */
export function meshesOf(holder: Object3D): Mesh[] {
  const meshes: Mesh[] = []
  holder.traverse(child => {
    if (child instanceof Mesh && !(child instanceof SkinnedMesh)) meshes.push(child)
  })
  return meshes
}

/**
 * One key per primitive of an instanceable model: the asset and which sub-mesh, never the
 * cloned material object. A dress is named so two dressed nodes do not collide with a bare one.
 */
export function modelShapeKey(node: SceneNode, mesh: Mesh): string {
  if (node.type !== 'model') return ''
  if (node.model.dress) return `dress:${stableKey(node.model.dress)}`
  let holder: Object3D | null = mesh
  while (holder && !isInstanceable(holder)) holder = holder.parent
  if (!holder) return ''
  const index = meshesOf(holder).indexOf(mesh)
  return index < 0 ? '' : `model:${node.model.assetId}|${index}`
}
