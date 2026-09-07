/**
 * What a loaded model IS, as far as animating it goes.
 *
 * Read off the object graph and nothing else. An asset's own 3D metadata was measured wrong on
 * 2026-08-17 — `hasSkeleton: false` on files carrying 22, 39 and 52 bones, `boneCount: null` on
 * all three, `size` off by two orders of magnitude — so the file is the only thing that answers.
 *
 * Pure, like `bonePicking.ts`: three runs under jsdom without a GPU, and every question here is
 * about the shape of a tree.
 */
import { Box3, Matrix4, Mesh, Vector3, type AnimationClip, type Bone, type Object3D } from 'three'
import type { HumanoidRole } from '@shared/domain/humanoid'
import { boneRolesOf } from './boneRoles'
import type { Bounds } from './rigFit'

export type RigStatus =
  /** No bones at all. This is what "make animatable" is offered on. */
  | 'staticMesh'
  /** Bones driving a mesh, none of them filling a humanoid role: hand animation only. */
  | 'skinnedMesh'
  /** Humanoid roles identified: the whole animation library applies. */
  | 'riggedCharacter'
  /** The same, and it already carries clips of its own. */
  | 'animatedCharacter'
  /** Bones and no skinned mesh. This is not a character — it is an animation asset. */
  | 'skeletonOnly'

export const RIG_STATUSES: readonly RigStatus[] = [
  'staticMesh',
  'skinnedMesh',
  'riggedCharacter',
  'animatedCharacter',
  'skeletonOnly',
]

/** One bone as the graph holds it, with the parent a rig needs and `bonesOf` never gave. */
export type SkeletonBone = {
  name: string
  /** The nearest bone above it, or `null` when it is a root of the rig. */
  parent: string | null
  /** The humanoid role its name spells, when the name spells one. */
  role?: HumanoidRole
}

export type RigState = {
  status: RigStatus
  /**
   * The NAMED bones only — an unnamed one cannot be addressed by a document, and a track pointing
   * at one would find nothing after a reload.
   */
  bones: readonly SkeletonBone[]
  /**
   * The same, by name alone. Held rather than derived because it is read through a zustand
   * selector, and an array built per call is a new snapshot every render.
   */
  boneNames: readonly string[]
  /**
   * How many bones the file holds, named or not. Apart from `bones.length` on purpose: some
   * export pipelines strip joint names, and such a rig still has a skeleton to draw.
   */
  boneCount: number
  /**
   * What the model measures, for whoever fits a skeleton to it. `null` for anything carrying
   * bones, which is never measured; a ZERO BOX for a bare mesh holding no vertices, which the
   * inspector reads as `noGeometry` — nulling that one too would drop the message in silence.
   */
  bounds: Bounds | null
  /**
   * The mesh's own vertices, subsampled, in the space the bones are hung in — what pulls a fitted
   * joint inside the body rather than onto the envelope. `null` beside a `null` box, and empty
   * for a mesh holding no vertex at all.
   */
  points: Float32Array | null
}

/**
 * How many vertices a fit is handed at most.
 *
 * Every one of them is walked once per joint, and a character can carry a million: at fifty-two
 * joints that is a walk nobody would wait for. A regular stride keeps the SHAPE — which is all a
 * cross-section needs — where taking the first N would hand it one limb and nothing else.
 */
const FIT_SAMPLE = 30_000

/** three marks its bones with a flag; `instanceof` would miss one from another three instance. */
export function isBoneObject(object: Object3D): object is Bone {
  return Reflect.get(object, 'isBone') === true
}

/**
 * Every named bone of a model, each with its parent.
 *
 * Deduplicated by name, and that is not tidiness: everything downstream resolves a bone through
 * `getObjectByName`, which answers exactly one object, so a second bone of the same name is a
 * bone nothing can ever address.
 */
export function skeletonBonesOf(root: Object3D): SkeletonBone[] {
  return walkBones(root).bones
}

/**
 * One pass, two answers: what can be addressed, and what is merely there.
 *
 * The roles are read from the whole skeleton at once rather than name by name, because two of the
 * rules need the tree: a contested role goes to the higher bone, and a neck that no name spells
 * is found between the trunk and the head.
 */
function walkBones(root: Object3D): { bones: SkeletonBone[]; boneCount: number } {
  const found: { name: string; parent: string | null }[] = []
  const seen = new Set<string>()
  let boneCount = 0

  root.traverse(object => {
    if (!isBoneObject(object)) return
    boneCount += 1
    if (!object.name || seen.has(object.name)) return

    seen.add(object.name)
    found.push({ name: object.name, parent: nearestBoneAbove(object) })
  })

  const roles = boneRolesOf(found)
  const bones = found.map(bone => {
    const role = roles[bone.name]
    return role ? { ...bone, role } : bone
  })

  return { bones, boneCount }
}

export function rigStateOf(root: Object3D, clips: readonly AnimationClip[] = []): RigState {
  const { bones, boneCount } = walkBones(root)
  const status = statusOf(root, bones, boneCount, clips.length > 0)
  const measured = status === 'staticMesh' ? measuredMeshOf(root) : null

  return {
    status,
    bones,
    boneNames: bones.map(bone => bone.name),
    boneCount,
    bounds: measured?.bounds ?? null,
    points: measured?.points ?? null,
  }
}

/**
 * What a bare mesh measures, in the space of the model that holds it.
 *
 * IN ITS OWN SPACE, and that is the whole of it: `Box3.setFromObject` answers a world box, while
 * the bones a fit produces are hung under this very object. Reading the world one would place the
 * skeleton wherever the model happens to stand in the scene, and scale it by whatever scale the
 * node wears.
 *
 * Public because a hand is fitted long after the mesh stopped being bare, and needs the same
 * points on a model that carries bones.
 */
export function measuredMeshOf(root: Object3D): { bounds: Bounds; points: Float32Array } {
  const box = new Box3()
  const point = new Vector3()
  const kept: number[] = []

  root.updateWorldMatrix(false, true)
  const intoRoot = new Matrix4().copy(root.matrixWorld).invert()

  // One pass, both answers: the walk over every vertex is the expensive part, and doing it twice
  // to measure and then to sample would double the wait on a million-vertex character.
  let seen = 0
  const stride = Math.max(1, Math.ceil(vertexCountOf(root) / FIT_SAMPLE))

  root.traverse(object => {
    if (!(object instanceof Mesh)) return

    const position = object.geometry.getAttribute('position')
    const toRoot = new Matrix4().multiplyMatrices(intoRoot, object.matrixWorld)
    for (let vertex = 0; vertex < position.count; vertex += 1) {
      box.expandByPoint(point.fromBufferAttribute(position, vertex).applyMatrix4(toRoot))
      if (seen % stride === 0) kept.push(point.x, point.y, point.z)
      seen += 1
    }
  })

  // `Box3` starts inverted, so a mesh with no vertex would place bones at the ends of the world.
  // Zeroes rather than `null`: that box is the route to `noGeometry`, the note the user reads.
  return {
    bounds: box.isEmpty() ? EMPTY_BOUNDS : { min: { ...box.min }, max: { ...box.max } },
    points: new Float32Array(kept),
  }
}

/** How many vertices the model holds, for the stride the sample walks with. */
function vertexCountOf(root: Object3D): number {
  let total = 0
  root.traverse(object => {
    if (object instanceof Mesh) total += object.geometry.getAttribute('position').count
  })
  return total
}

const EMPTY_BOUNDS: Bounds = { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } }

function statusOf(
  root: Object3D,
  bones: readonly SkeletonBone[],
  boneCount: number,
  animated: boolean,
): RigStatus {
  if (boneCount === 0) return 'staticMesh'
  if (!root.getObjectByProperty('isSkinnedMesh', true)) return 'skeletonOnly'
  if (!isHumanoidEnough(bones)) return 'skinnedMesh'

  return animated ? 'animatedCharacter' : 'riggedCharacter'
}

/**
 * Whether calling this a character would promise something true.
 *
 * The hips and one WHOLE limb, which is the least retargeting can say anything with: a root to
 * hang the pose on, and one chain to replay. One recognised role used to be enough, and that was
 * safe only while the studio's own rigger was the sole thing producing recognised names — reading
 * the provider conventions made `Spine` plus `Head` on a dragon read as a person, and it would be
 * offered the humanoid animation library.
 */
function isHumanoidEnough(bones: readonly SkeletonBone[]): boolean {
  const roles = new Set(bones.flatMap(bone => (bone.role ? [bone.role] : [])))
  if (!roles.has('Hips')) return false

  return LIMB_CHAINS.some(chain => chain.every(role => roles.has(role)))
}

/** Written out rather than built from the sides: four is fewer lines than the machinery would be. */
const LIMB_CHAINS: readonly (readonly HumanoidRole[])[] = [
  ['LeftUpperArm', 'LeftLowerArm', 'LeftHand'],
  ['RightUpperArm', 'RightLowerArm', 'RightHand'],
  ['LeftUpperLeg', 'LeftLowerLeg', 'LeftFoot'],
  ['RightUpperLeg', 'RightLowerLeg', 'RightFoot'],
]

function nearestBoneAbove(bone: Object3D): string | null {
  let above = bone.parent
  while (above) {
    if (isBoneObject(above) && above.name) return above.name
    above = above.parent
  }
  return null
}
