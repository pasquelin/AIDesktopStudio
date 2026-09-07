import { Matrix4, type Object3D, type SkinnedMesh } from 'three'
import type { Rig, RigBone, RigFault, RigOrigin } from '@shared/domain/rig'
import { rigFaultOf } from '@shared/domain/rig'
import { characterExtrasOf, type CharacterExtras } from '@shared/domain/character'
import { transformOfMatrix } from '../csg/csgMatrix'
import { isBoneObject, skeletonBonesOf } from './rigState'

/**
 * A skeleton a `.glb` already carries, read back as the document spells one.
 *
 * The other half of `rigFit`, and the one the studio never had: a character rigged elsewhere —
 * by Blender, by a service — was a file whose bones nothing here could edit.
 */
export type RigReadFault = 'no-bones' | 'no-named-bone' | RigFault

/** Why this model gives no rig, or nothing. Read before a caller offers to fit one. */
export function rigReadFaultOf(root: Object3D): RigReadFault | null {
  const bones = rigBonesOf(root)
  if (bones.length > 0) return rigFaultOf(bones)

  return skeletonBonesOf(root).length === 0 && !hasBone(root) ? 'no-bones' : 'no-named-bone'
}

/**
 * The bones a loaded model carries, each rest pose in the space of the parent the RIG keeps.
 *
 * 🛑 Never the bone's own `position`/`quaternion`/`scale`: those are local to the true parent, and
 * an unnamed bone or a plain group in between makes that a space `bonesOfRig` will not rebuild.
 *
 * The order is the FILE's, parents before children — not the one a fitter laid its bones in.
 */
export function rigBonesOf(root: Object3D): RigBone[] {
  // Asked FIRST: a model with no bone is most of a scene, and it would otherwise pay a full walk
  // and a `Matrix4` per named object to be handed an empty list.
  const bones = skeletonBonesOf(root)
  if (bones.length === 0) return []

  const places = bindPlacesOf(root)
  const held = new Matrix4()

  return bones.flatMap(bone => {
    const place = places.get(bone.name)
    const above = bone.parent === null ? root.matrixWorld : places.get(bone.parent)
    if (!place || !above) return []

    held.copy(above).invert().multiply(place)
    return [{ ...bone, rest: transformOfMatrix(held) }]
  })
}

/**
 * The rig a model already wears, or `null` when it wears none this studio can hold.
 *
 * A role the FILE puts right wins over the one a name spells: correcting « this bone is the left
 * hip » is what makes a foreign skeleton animatable, and glTF has nowhere else to keep it.
 */
export function rigFromObject(root: Object3D, origin: RigOrigin = 'imported'): Rig | null {
  return characterOf(root, origin).rig
}

/**
 * The skeleton a `.glb` carries AND what the studio wrote beside it, in one read.
 *
 * Together because the roles of the second correct the first, and because walking the file twice
 * for two answers is what the engine pays per model, in every scene.
 */
export function characterOf(
  root: Object3D,
  origin: RigOrigin = 'imported',
): { rig: Rig | null; extras: CharacterExtras | null } {
  const extras = characterExtrasIn(root)
  const corrected = extras?.roles ?? {}
  const bones = rigBonesOf(root).map(bone => {
    const role = corrected[bone.name]
    return role ? { ...bone, role } : bone
  })

  const held = bones.length > 0 && rigFaultOf(bones) === null ? { bones, origin } : null
  return { rig: held, extras }
}

/**
 * What the studio wrote into this file, wherever the loader hung it.
 *
 * 🛑 Searched rather than read off the root: `GLTFLoader` puts a scene's `extras` on the scene it
 * makes, and an engine holding that scene inside a placement of its own would find nothing there.
 */
export function characterExtrasIn(root: Object3D): CharacterExtras | null {
  // A walk that STOPS, where `traverse` cannot: what the loader writes sits two or three levels
  // down, and the rest of a character is thousands of objects with nothing to say.
  const pending: Object3D[] = [root]
  while (pending.length > 0) {
    const object = pending.pop()
    if (!object) break

    const found = characterExtrasOf(object.userData)
    if (found) return found
    pending.push(...object.children)
  }

  return null
}

/**
 * Where each bone stands in its BIND pose, which is the pose a rig holds.
 *
 * 🛑 A file exported mid-animation has nodes that are not the bind pose; the inverse bind matrices
 * are it by definition, so a skinned bone is read from them and only a loose one from the graph.
 */
function bindPlacesOf(root: Object3D): Map<string, Matrix4> {
  root.updateWorldMatrix(false, true)

  const places = new Map<string, Matrix4>()
  root.traverse(object => {
    if (object.name && !places.has(object.name)) places.set(object.name, object.matrixWorld.clone())
  })

  for (const skinned of skinnedIn(root)) {
    skinned.skeleton.bones.forEach((bone, index) => {
      const inverse = skinned.skeleton.boneInverses[index]
      if (!bone.name || !inverse) return

      places.set(
        bone.name,
        new Matrix4().copy(skinned.bindMatrix).multiply(inverse.clone().invert()),
      )
    })
  }

  return places
}

/** The flag rather than `instanceof`, which would miss one from another three instance. */
function skinnedIn(root: Object3D): SkinnedMesh[] {
  return root
    .getObjectsByProperty('isSkinnedMesh', true)
    .filter((object): object is SkinnedMesh => Reflect.get(object, 'isSkinnedMesh') === true)
}

function hasBone(root: Object3D): boolean {
  let found = false
  root.traverse(object => {
    if (isBoneObject(object)) found = true
  })

  return found
}
