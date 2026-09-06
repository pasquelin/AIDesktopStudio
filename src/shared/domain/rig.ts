import { isRecord } from '../guards'
import { isHumanoidRole, type HumanoidRole } from './humanoid'
import { IDENTITY_TRANSFORM, isTransform, finiteTransform, type Transform } from './transform'

/**
 * A skeleton the studio owns, as the document holds it.
 *
 * The hierarchy is FREE — any tree at all: a tail, wings, four legs, tentacles, phalanges. The
 * humanoid roles are optional labels put on top (see `humanoid.ts`), and they alone are what makes
 * retargeting possible. A model without them stays riggable and animatable by hand.
 *
 * This is the one place where the inside of a model does enter the document, against the rule
 * `ModelRef` states: a rig is EDITED, bone by bone, so it wants the undo the command system gives
 * for free. The skinning weights do not follow it — they are derived from mesh and rig, exactly as
 * a BVH is, and four floats per vertex have no business in a saved file.
 */
export type Rig = {
  bones: readonly RigBone[]
  /** Who produced it — to tell the user, and to replay a fit. */
  origin: RigOrigin
  /** What reaches for something instead of being posed joint by joint. */
  ik?: readonly IkChain[]
}

/**
 * A chain that reaches: a foot that stays on the ground, a hand that follows a handle.
 *
 * All three are BONES OF THIS RIG, target included, and that is not a simplification — three's
 * `CCDIKSolver` addresses `Skeleton.bones` by index and knows nothing else. The target is
 * therefore a bone one moves at the gizmo, or that a clip drives like any other.
 */
export type IkChain = {
  id: string
  /** The bone that has to arrive at the target. */
  effector: string
  /** The bone it reaches for. */
  target: string
  /** The bones allowed to turn on the way, effector's parent first. */
  links: readonly string[]
  /** How many passes the solver makes. Fewer is faster and less exact. */
  iterations?: number
}

export type RigOrigin = 'local' | 'imported' | { provider: string; modelId: string }

export type RigBone = {
  /** Unique within the rig. This is the name the three `Bone` wears, and what a track addresses. */
  name: string
  /** `null` for the root. */
  parent: string | null
  /** The rest pose, in the parent's space. */
  rest: Transform
  /** The humanoid role this bone fills, when it fills one. */
  role?: HumanoidRole
}

/**
 * Why a rig cannot be held, or nothing.
 *
 * A string rather than a boolean because every caller has something to do with it: the document
 * reader drops the model, and a command refuses the edit and says which rule it broke.
 */
export type RigFault =
  'empty' | 'duplicate-bone' | 'unknown-parent' | 'cycle' | 'duplicate-role' | 'invalid-transform'

export function rigFaultOf(bones: readonly RigBone[]): RigFault | null {
  if (bones.length === 0) return 'empty'

  const byName = new Map<string, RigBone>()
  for (const bone of bones) {
    if (byName.has(bone.name)) return 'duplicate-bone'
    byName.set(bone.name, bone)
  }

  const roles = new Set<HumanoidRole>()
  for (const bone of bones) {
    if (!finiteTransform(bone.rest)) return 'invalid-transform'
    if (bone.parent !== null && !byName.has(bone.parent)) return 'unknown-parent'
    if (!bone.role) continue
    if (roles.has(bone.role)) return 'duplicate-role'
    roles.add(bone.role)
  }

  return hasCycle(bones, byName) ? 'cycle' : null
}

/**
 * The bones with one more, or `null` when the rig would not stand it — a name already taken, a
 * parent nobody holds, a role another bone fills. `rigFaultOf` is the one judge of that.
 */
export function rigWithBones(
  bones: readonly RigBone[],
  added: readonly RigBone[],
): RigBone[] | null {
  const next = [...bones, ...added]
  return rigFaultOf(next) === null ? next : null
}

/**
 * A bone hung under another, resting exactly ON it — the gizmo is what puts it where it belongs.
 *
 * Named after its parent rather than from a word, so a document written in one language reads the
 * same in another, and so the name is free without a counter to keep.
 */
export function childBone(bones: readonly RigBone[], parent: string): RigBone {
  const taken = new Set(bones.map(bone => bone.name))
  let name = `${parent}.1`
  for (let index = 2; taken.has(name); index += 1) name = `${parent}.${index}`

  return { name, parent, rest: IDENTITY_TRANSFORM }
}

/**
 * The bones without one, its children hung where it hung.
 *
 * Reparented rather than removed with it: taking an elbow out must not take the hand and its
 * fingers with it. A track addressing the bone by name survives untouched — the document
 * addresses bones by NAME, so nothing it holds points at what has gone.
 */
export function rigWithoutBone(bones: readonly RigBone[], name: string): RigBone[] {
  const removed = bones.find(bone => bone.name === name)
  if (!removed) return [...bones]

  return bones
    .filter(bone => bone.name !== name)
    .map(bone => (bone.parent === name ? { ...bone, parent: removed.parent } : bone))
}

/** The bones with one renamed, its children following. `null` when the new name is taken. */
export function rigRenamed(bones: readonly RigBone[], from: string, to: string): RigBone[] | null {
  if (to === '' || !bones.some(bone => bone.name === from)) return null

  const next = bones.map(bone => ({
    ...bone,
    name: bone.name === from ? to : bone.name,
    parent: bone.parent === from ? to : bone.parent,
  }))
  return rigFaultOf(next) === null ? next : null
}

/**
 * The bones with one filling a role, or filling none when `role` is `null`.
 *
 * Whatever bone held that role loses it in the same move, because a rig holding one role twice
 * is a `duplicate-role` fault and the reader drops such a model whole.
 */
export function rigWithRole(
  bones: readonly RigBone[],
  name: string,
  role: HumanoidRole | null,
): RigBone[] {
  return bones.map(bone => {
    const rest = { ...bone }
    if (bone.name === name || bone.role === role) delete rest.role

    return bone.name === name && role !== null ? { ...rest, role } : rest
  })
}

/**
 * One bone put back where it rests, in its parent's space.
 *
 * The whole of what makes an approximate fit usable: proportions read off a bounding box land a
 * joint near where it belongs, and the hand that corrects it writes here. A name the rig has not
 * got changes nothing rather than adding a bone — the gizmo can outlive a rename.
 */
export function rigWithRest(
  bones: readonly RigBone[],
  name: string,
  rest: Transform,
): readonly RigBone[] {
  return bones.map(bone => (bone.name === name ? { ...bone, rest } : bone))
}

/**
 * The suffix a handle's name carries. A chain reaches for a BONE — three's solver knows nothing
 * else — so the one thing that tells a handle from a joint is how it is called.
 */
export const IK_HANDLE = '.handle'

/** 🛑 A handle is not part of the body: nothing of the mesh may ever be weighed against one. */
export function isIkHandle(name: string): boolean {
  return name.endsWith(IK_HANDLE)
}

export function isRig(value: unknown): value is Rig {
  if (!isRecord(value) || !Array.isArray(value.bones)) return false
  if (!isRigOrigin(value.origin)) return false
  if (!value.bones.every(isRigBone)) return false
  if (value.ik !== undefined && !(Array.isArray(value.ik) && value.ik.every(isIkChain)))
    return false

  return rigFaultOf(value.bones) === null
}

/**
 * Structural only: whether the bones it names are still there is settled where the solver is
 * built, and a chain naming one that has gone is DROPPED rather than taking the model with it —
 * the same rule a track addressing a removed bone lives under.
 */
function isIkChain(value: unknown): value is IkChain {
  if (!isRecord(value)) return false
  if (typeof value.id !== 'string' || value.id === '') return false
  if (typeof value.effector !== 'string' || typeof value.target !== 'string') return false
  if (!Array.isArray(value.links) || !value.links.every(link => typeof link === 'string')) {
    return false
  }

  return value.iterations === undefined || typeof value.iterations === 'number'
}

/**
 * Walks each bone up to its root, marking what is already known to reach one.
 *
 * The walk stops on a bone it has already stepped on, which is what a cycle is: without that it
 * would hang rather than answer. Marking keeps the whole pass linear.
 */
function hasCycle(bones: readonly RigBone[], byName: ReadonlyMap<string, RigBone>): boolean {
  const rooted = new Set<string>()

  for (const bone of bones) {
    const seen = new Set<string>()
    let current: RigBone | undefined = bone

    while (current && !rooted.has(current.name)) {
      if (seen.has(current.name)) return true
      seen.add(current.name)
      current = current.parent === null ? undefined : byName.get(current.parent)
    }
    for (const name of seen) rooted.add(name)
  }

  return false
}

function isRigBone(value: unknown): value is RigBone {
  if (!isRecord(value)) return false
  if (typeof value.name !== 'string' || value.name === '') return false
  if (value.parent !== null && typeof value.parent !== 'string') return false
  if (value.role !== undefined && !isHumanoidRole(value.role)) return false

  return isTransform(value.rest)
}

function isRigOrigin(value: unknown): value is RigOrigin {
  if (value === 'local' || value === 'imported') return true

  return isRecord(value) && typeof value.provider === 'string' && typeof value.modelId === 'string'
}
