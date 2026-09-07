import { BufferAttribute, Mesh, SkinnedMesh, type Object3D } from 'three'
import { characterExtrasIn } from './rigRead'
import { boneRolesOf } from './boneRoles'
import { skeletonTopologySignatureOf, type SkeletonProfile } from '@shared/domain/skeletonProfile'

type ProfileOf = (signature: string) => SkeletonProfile | undefined

/** Changes only camera-pass indices; shadows retain the complete animated character. */
export class FirstPersonBody {
  private readonly held = new Map<Mesh, () => void>()

  sync(root: Object3D | undefined, profileOf?: ProfileOf): void {
    const meshes = new Set<Mesh>()
    root?.traverse(object => {
      if (object instanceof Mesh) meshes.add(object)
    })
    for (const [mesh, restore] of this.held) {
      if (meshes.has(mesh)) continue
      restore()
      this.held.delete(mesh)
    }
    for (const mesh of meshes) {
      if (this.held.has(mesh)) continue
      const roles = root ? characterExtrasIn(root)?.roles : undefined
      const masked = headIndices(
        mesh,
        signature => profileOf?.(signature) ?? (roles ? { signature, roles } : undefined),
      )
      this.held.set(mesh, masked ? maskDuringCameraPass(mesh, masked) : () => {})
    }
  }

  dispose(): void {
    for (const restore of this.held.values()) restore()
    this.held.clear()
  }
}

function headIndices(mesh: Mesh, profileOf?: ProfileOf): BufferAttribute | null {
  const skin = mesh.geometry.getAttribute('skinIndex')
  const weights = mesh.geometry.getAttribute('skinWeight')
  if (!(mesh instanceof SkinnedMesh) || !skin || !weights) return null
  const bones = mesh.skeleton.bones.map(bone => ({
    name: bone.name,
    parent: bone.parent?.type === 'Bone' ? bone.parent.name : null,
  }))
  const profile = profileOf?.(skeletonTopologySignatureOf(bones))
  const roles = profile?.roles ?? boneRolesOf(bones)
  const head = mesh.skeleton.bones.find(bone => roles[bone.name] === 'Head')
  if (!head) return null
  const hidden = new Set<Object3D>()
  head.traverse(bone => hidden.add(bone))
  const headBones = mesh.skeleton.bones.map(bone => hidden.has(bone))
  const masked = new Uint8Array(skin.count)
  for (let vertex = 0; vertex < skin.count; vertex += 1) {
    let weight = 0
    for (let slot = 0; slot < skin.itemSize; slot += 1) {
      if (headBones[skin.getComponent(vertex, slot)]) weight += weights.getComponent(vertex, slot)
    }
    masked[vertex] = weight >= 0.5 ? 1 : 0
  }
  return withoutHeadTriangles(mesh, masked)
}

function withoutHeadTriangles(mesh: Mesh, masked: Uint8Array): BufferAttribute {
  const original = mesh.geometry.index
  const count = original?.count ?? mesh.geometry.getAttribute('position').count
  const indices = original
    ? new Uint32Array(original.array)
    : Uint32Array.from({ length: count }, (_, index) => index)
  for (let index = 0; index < count; index += 3) {
    const a = indices[index]
    const b = indices[index + 1]
    const c = indices[index + 2]
    if (a === undefined || b === undefined || c === undefined) break
    if (masked[a] || masked[b] || masked[c]) {
      indices[index + 1] = a
      indices[index + 2] = a
    }
  }
  return new BufferAttribute(indices, 1)
}

function maskDuringCameraPass(mesh: Mesh, indices: BufferAttribute): () => void {
  const original = mesh.geometry
  const geometry = original.clone()
  const before = mesh.onBeforeRender
  const after = mesh.onAfterRender
  mesh.geometry = geometry
  mesh.onBeforeRender = function (...args) {
    before.apply(this, args)
    geometry.setIndex(indices)
  }
  mesh.onAfterRender = function (...args) {
    geometry.setIndex(original.index)
    after.apply(this, args)
  }
  return () => {
    mesh.onBeforeRender = before
    mesh.onAfterRender = after
    mesh.geometry = original
    geometry.setIndex(indices)
    geometry.dispose()
  }
}
