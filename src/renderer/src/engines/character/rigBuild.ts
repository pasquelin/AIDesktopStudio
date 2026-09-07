/**
 * A `Rig` made into bones three can drive, and a mesh bound to them.
 *
 * The document holds the skeleton; the weights are DERIVED and rebuilt on every load, exactly as
 * a BVH is. That is why this runs again each time a rigged model lands rather than reading four
 * floats per vertex out of a saved file.
 */
import {
  Bone,
  BufferAttribute,
  type BufferGeometry,
  Matrix4,
  Mesh,
  Object3D,
  Skeleton,
  SkinnedMesh,
  Uint16BufferAttribute,
  Vector3,
} from 'three'
import type { Rig } from '@shared/domain/rig'
import { INFLUENCES } from './skinMessage'
import type { SkinBinding } from './skinVertices'

/** Every mesh of a model that could be bound: one already skinned is left to the file that made it. */
export function skinnableMeshesOf(root: Object3D): Mesh[] {
  const meshes: Mesh[] = []
  root.traverse(object => {
    if (object instanceof Mesh && !(object instanceof SkinnedMesh)) meshes.push(object)
  })
  return meshes
}

/**
 * 🛑 The meshes to weigh again against a rig that CHANGED SHAPE — the skinned ones included.
 *
 * `skinnableMeshesOf` answers « can a rig be laid on this at all », and a mesh already skinned is
 * rightly none of its business. Asked here, it answered nothing for every character already
 * rigged: adding hands took the store from 22 bones to 52 and the model kept its 22, in silence.
 */
export function reskinnableMeshesOf(root: Object3D): Mesh[] {
  const meshes: Mesh[] = []
  root.traverse(object => {
    if (object instanceof Mesh) meshes.push(object)
  })
  return meshes
}

/**
 * Takes the bones a previous rig hung on this model off it, so one of another shape is laid on a
 * bare model rather than beside the skeleton it replaces — where `wearsRig` would then count both.
 */
export function unrig(holder: Object3D): void {
  for (const root of [...holder.children]) {
    if (root instanceof Bone) root.removeFromParent()
  }
}

export function removeRig(holder: Object3D): void {
  const skinned: SkinnedMesh[] = []
  holder.traverse(object => {
    if (object instanceof SkinnedMesh) skinned.push(object)
  })
  unrig(holder)
  for (const mesh of skinned) {
    const geometry = ownGeometry(mesh.geometry.clone())
    geometry.deleteAttribute('skinIndex')
    geometry.deleteAttribute('skinWeight')
    const plain = new Mesh(geometry, mesh.material)
    // `Object3D`'s copy, never `Mesh`'s: that one ends on `this.geometry = source.geometry`, so
    // the cleaned clone was thrown away, the skin came back, and the dispose below freed the
    // geometry the mesh had just been handed.
    Object3D.prototype.copy.call(plain, mesh, false)
    plain.castShadow = mesh.castShadow
    plain.receiveShadow = mesh.receiveShadow
    plain.updateMorphTargets()
    if (mesh.morphTargetInfluences) plain.morphTargetInfluences = [...mesh.morphTargetInfluences]
    if (mesh.morphTargetDictionary) plain.morphTargetDictionary = { ...mesh.morphTargetDictionary }
    const parent = mesh.parent ?? holder
    const index = parent.children.indexOf(mesh)
    const children = [...mesh.children]
    parent.add(plain)
    for (const child of children) plain.add(child)
    mesh.removeFromParent()
    moveChildTo(parent, plain, index)
    disposeOwnedGeometry(mesh.geometry)
  }
}

/**
 * The vertex positions of a mesh, in the space its holder measures in.
 *
 * Both halves have to agree or the rig lands beside the body: the bones are fitted to the
 * holder's bounding box, while a mesh inside a GLB carries a transform of its own.
 */
export function positionsIn(mesh: Mesh, holder: Object3D): Float32Array {
  const attribute = mesh.geometry.getAttribute('position')
  const positions = new Float32Array(attribute.count * 3)

  holder.updateWorldMatrix(true, true)
  const into = new Matrix4().copy(holder.matrixWorld).invert().multiply(mesh.matrixWorld)

  // One scratch vector and three writes: half a million allocations — one per `set` of a fresh
  // array literal — is half a million reasons for the collector to interrupt a bind.
  const point = new Vector3()
  for (let vertex = 0; vertex < attribute.count; vertex += 1) {
    point.fromBufferAttribute(attribute, vertex).applyMatrix4(into)
    positions[vertex * 3] = point.x
    positions[vertex * 3 + 1] = point.y
    positions[vertex * 3 + 2] = point.z
  }

  return positions
}

/** The bones of a rig, parented as it spells them, and the roots to hang on the model. */
export function bonesOfRig(rig: Rig): { bones: Bone[]; roots: Bone[] } {
  const byName = new Map<string, Bone>()

  for (const spec of rig.bones) {
    const bone = new Bone()
    bone.name = spec.name
    bone.position.set(spec.rest.position.x, spec.rest.position.y, spec.rest.position.z)
    bone.rotation.set(spec.rest.rotation.x, spec.rest.rotation.y, spec.rest.rotation.z)
    bone.scale.set(spec.rest.scale.x, spec.rest.scale.y, spec.rest.scale.z)
    byName.set(spec.name, bone)
  }

  const roots: Bone[] = []
  for (const spec of rig.bones) {
    const bone = byName.get(spec.name)
    if (!bone) continue

    const parent = spec.parent === null ? null : byName.get(spec.parent)
    if (parent) parent.add(bone)
    else roots.push(bone)
  }

  // The order is the rig's, which is the order the weights index into.
  return { bones: rig.bones.map(spec => byName.get(spec.name)).filter(isBone), roots }
}

/**
 * Puts a rig on a model: bones hung under the holder, and every plain mesh replaced by a skinned
 * one bound to them.
 *
 * Replaced rather than mutated because `SkinnedMesh` is a different class — three decides what to
 * do with a geometry by what holds it, and a `Mesh` wearing skin attributes is simply ignored.
 */
export function applyRig(
  holder: Object3D,
  rig: Rig,
  bound: readonly { mesh: Mesh; binding: SkinBinding }[],
): void {
  if (bound.length === 0) return

  const previousRoots = holder.children.filter(child => child instanceof Bone)
  const { bones, roots } = bonesOfRig(rig)
  const prepared = bound.map(({ mesh, binding }) => {
    const geometry = ownGeometry(mesh.geometry.clone())
    geometry.setAttribute('skinIndex', new Uint16BufferAttribute(binding.skinIndex, INFLUENCES))
    geometry.setAttribute('skinWeight', new BufferAttribute(binding.skinWeight, INFLUENCES))
    const skinned = new SkinnedMesh(geometry, mesh.material)
    Object3D.prototype.copy.call(skinned, mesh, false)
    skinned.castShadow = mesh.castShadow
    skinned.receiveShadow = mesh.receiveShadow
    skinned.onBeforeRender = mesh.onBeforeRender
    skinned.onAfterRender = mesh.onAfterRender
    skinned.updateMorphTargets()
    if (mesh.morphTargetInfluences) skinned.morphTargetInfluences = [...mesh.morphTargetInfluences]
    if (mesh.morphTargetDictionary)
      skinned.morphTargetDictionary = { ...mesh.morphTargetDictionary }
    const parent = mesh.parent ?? holder
    return {
      mesh,
      skinned,
      parent,
      index: parent.children.indexOf(mesh),
      children: [...mesh.children],
    }
  })

  try {
    for (const root of roots) holder.add(root)
    holder.updateWorldMatrix(false, true)
    const skeleton = new Skeleton(bones)
    for (const entry of prepared) replaceMesh(entry, skeleton)
    restInverses(holder)
    for (const root of previousRoots) root.removeFromParent()
    for (const { mesh } of prepared) disposeOwnedGeometry(mesh.geometry)
  } catch (error) {
    for (const root of roots) root.removeFromParent()
    for (const entry of prepared.toReversed()) restoreMesh(entry)
    for (const { skinned } of prepared) disposeOwnedGeometry(skinned.geometry)
    throw error
  }
}

type PreparedMesh = {
  mesh: Mesh
  skinned: SkinnedMesh
  parent: Object3D
  index: number
  children: readonly Object3D[]
}

function replaceMesh(entry: PreparedMesh, skeleton: Skeleton): void {
  entry.parent.add(entry.skinned)
  for (const child of entry.children) entry.skinned.add(child)
  entry.mesh.removeFromParent()
  moveChildTo(entry.parent, entry.skinned, entry.index)
  entry.skinned.bind(skeleton)
}

function restoreMesh(entry: PreparedMesh): void {
  for (const child of entry.children) entry.mesh.add(child)
  entry.skinned.removeFromParent()
  if (entry.mesh.parent !== entry.parent) entry.parent.add(entry.mesh)
  moveChildTo(entry.parent, entry.mesh, entry.index)
}

const ownedGeometry = new WeakSet<BufferGeometry>()

function ownGeometry(geometry: BufferGeometry): BufferGeometry {
  ownedGeometry.add(geometry)
  return geometry
}

function disposeOwnedGeometry(geometry: BufferGeometry): void {
  if (!ownedGeometry.has(geometry)) return
  ownedGeometry.delete(geometry)
  geometry.dispose()
}

function moveChildTo(parent: Object3D, child: Object3D, index: number): void {
  const current = parent.children.indexOf(child)
  if (current < 0 || current === index) return
  parent.children.splice(current, 1)
  parent.children.splice(index, 0, child)
}

/**
 * Whether a model already wears exactly these bones — same names, same parents.
 *
 * What tells a REST EDIT from a rebuild: moving a joint changes where the bones stand and never
 * which ones there are, and only the second needs the weights worked out again.
 */
export function wearsRig(holder: Object3D, rig: Rig): boolean {
  const worn = new Map<string, Object3D>()
  holder.traverse(object => {
    if (object instanceof Bone && object.name) worn.set(object.name, object)
  })
  if (worn.size !== rig.bones.length) return false

  return rig.bones.every(spec => {
    const bone = worn.get(spec.name)
    const parent = bone?.parent
    return bone !== undefined && (spec.parent === null || parent?.name === spec.parent)
  })
}

/**
 * The bones a model already wears, put back where the rig now rests — and the skin left exactly
 * where it was.
 *
 * This is a skeleton editor's EDIT mode, and the whole of what makes one usable: a joint dragged
 * onto the elbow it belongs in must not drag the arm with it. The weights are per vertex and do
 * not change; what changes is the pose every one of them is measured FROM, so the inverses are
 * taken again and the deformation is the identity once more.
 *
 * 🛑 Without it, a rig edited after the first bind posed the character with weights bound to a
 * rest pose that no longer existed — the model stretched, and the leg bones ran out under
 * its feet. Measured on screen.
 */
export function restRig(holder: Object3D, rig: Rig): void {
  const worn = new Map<string, Bone>()
  holder.traverse(object => {
    if (object instanceof Bone && object.name) worn.set(object.name, object)
  })

  for (const spec of rig.bones) {
    const bone = worn.get(spec.name)
    if (!bone) continue

    bone.position.set(spec.rest.position.x, spec.rest.position.y, spec.rest.position.z)
    bone.rotation.set(spec.rest.rotation.x, spec.rest.rotation.y, spec.rest.rotation.z)
    bone.scale.set(spec.rest.scale.x, spec.rest.scale.y, spec.rest.scale.z)
  }

  restInverses(holder)
}

/**
 * Every skin under `holder` re-measured from where its bones stand NOW.
 *
 * Apart from `restRig` because the gizmo writes to the bones directly, a frame at a time: what
 * has to happen then is only this half, and re-reading a whole rig sixty times a second to do it
 * would be the rig read for nothing.
 */
export function restInverses(holder: Object3D): void {
  // Before the inverses, never after: `calculateInverses` reads each bone's `matrixWorld`, and a
  // bone whose position was just written still carries the one from the frame before.
  holder.updateWorldMatrix(false, true)
  holder.traverse(object => {
    if (object instanceof SkinnedMesh) object.skeleton.calculateInverses()
  })
}

function isBone(bone: Bone | undefined): bone is Bone {
  return bone !== undefined
}
