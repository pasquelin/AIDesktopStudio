/**
 * The port onto the retargeting worker: an animation authored for one skeleton, replayed on
 * another.
 *
 * `skinWeights`'s shape, over the same `workerPort`. What is its own is the short circuit: two
 * identical skeletons need no worker at all, and asking for one would replace an exact clip with
 * a resampled approximation of itself.
 */
import {
  AnimationClip,
  Bone,
  Matrix4,
  NumberKeyframeTrack,
  Quaternion,
  QuaternionKeyframeTrack,
  Skeleton,
  SkinnedMesh,
  Vector3,
  VectorKeyframeTrack,
  type KeyframeTrack,
  Object3D,
} from 'three'
import { isFingerRole, type HumanoidRole } from '@shared/domain/humanoid'
import {
  profileWithRole,
  skeletonSignatureOf,
  type SkeletonProfile,
} from '@shared/domain/skeletonProfile'
import { boneRolesOf, type NamedBone } from './boneRoles'
import { isBoneObject } from './rigState'
import {
  clipBuffers,
  type RetargetRequest,
  type RetargetResponse,
  type WireBone,
  type WireClip,
  type WireTrack,
  type WireTrackKind,
} from './retargetMessage'
import { createWorkerPort } from '../core/workerPort'

export type Retarget = {
  /**
   * The clips as the target skeleton would play them. `null` means the request was taken back, or
   * the port let go while it was out — an awaited promise nobody answers never ends.
   */
  adapt: (
    target: Object3D,
    source: Object3D,
    clips: readonly AnimationClip[],
    watch?: { onProgress?: (progress: number) => void; signal?: AbortSignal },
  ) => Promise<AnimationClip[] | null>
  /**
   * How well a motion fits this character, read through the very corrections a transfer uses.
   *
   * On the port and not called free-standing: the recorded roles live here, and a verdict read
   * without them announced a joint « staying at rest » that the transfer went on to drive.
   */
  fitOf: (target: Object3D, source: Object3D) => RetargetFit
  /**
   * What a skeleton of that signature means, from now on and for every model carrying it.
   *
   * Recognised by SIGNATURE and not by model: a mapping put right on one character is the same
   * mapping the next file of that rig needs, and asking twice for the same correction is the
   * thing this closes. Profiles a project remembered are handed back the same way.
   */
  remember: (profile: SkeletonProfile) => void
  dispose: () => void
}

export function createRetarget(spawn: () => Worker): Retarget {
  const port = createWorkerPort<readonly WireClip[], RetargetResponse>(
    spawn,
    'retargeting',
    answer => answer.clips,
  )
  const profiles = new Map<string, SkeletonProfile>()

  return {
    adapt: async (target, source, clips, watch) => {
      if (port.isGone()) return null

      const targetBones = wireBonesOf(target)
      const sourceBones = wireBonesOf(source)
      // Nothing to replay: the clips already speak this skeleton's language, exactly.
      if (sameSkeleton(targetBones, sourceBones)) return [...clips]

      const plan = retargetPlanOf(
        targetBones,
        sourceBones,
        clips.map(wireClipOf),
        undefined,
        profiles,
      )
      const adapted = await port.send(id => {
        const request: RetargetRequest = { id, ...plan }
        return { message: request, transfer: clipBuffers(request.clips) }
      }, watch)

      return adapted && adapted.map(clipFromWire)
    },

    fitOf: (target, source) => retargetFitOf(target, source, profiles),

    remember: profile => void profiles.set(profile.signature, profile),

    dispose: () => {
      profiles.clear()
      port.dispose()
    },
  }
}

/**
 * What to ask the worker for: which target bone reads which source bone, and where the hips are.
 *
 * The roles do the matching, since that is the whole reason they exist; bones that already share
 * a name are paired first, so a skeleton only partly recognised still carries over what is plain.
 */
export function retargetPlanOf(
  target: readonly WireBone[],
  source: readonly WireBone[],
  clips: readonly WireClip[],
  fps?: number,
  known?: ReadonlyMap<string, SkeletonProfile>,
): Omit<RetargetRequest, 'id'> {
  const sourceRoles = rolesOf(source, known)
  const sourceByRole = new Map(Object.entries(sourceRoles).map(([name, role]) => [role, name]))
  const sourceNames = new Set(source.map(bone => bone.name))

  const names: Record<string, string> = {}
  for (const bone of target) if (sourceNames.has(bone.name)) names[bone.name] = bone.name

  for (const [name, role] of Object.entries(rolesOf(target, known))) {
    const from = sourceByRole.get(role)
    if (from) names[name] = from
  }

  return { target, source, clips, names, hip: sourceByRole.get('Hips'), fps }
}

/**
 * How well an animation fits a character: which joints both of them name, and which only one does.
 *
 * What the screen needs to say « compatible » or « not quite », and to say WHICH joint is the
 * trouble. Roles and not bones, because that is the only vocabulary the two skeletons share —
 * `mixamorigLeftHand` and `L_Hand` are the same thing and no string comparison says so.
 */
export type RetargetFit = {
  matched: HumanoidRole[]
  /** Named by the character and not by the animation: that joint will simply stay at rest. */
  missingInSource: HumanoidRole[]
  /** Named by the animation and not by the character: that much of the motion is dropped. */
  missingInTarget: HumanoidRole[]
}

/**
 * The same two lists with the hands taken out — what a reader is actually asked to judge.
 *
 * MEASURED on the issue's files: Uthana Character Rigging carries 22 bones and stops at the
 * wrists, so every Mixamo motion drops its thirty fingers on one. Counting those would warn on
 * the ordinary case, and list thirty rows nobody can act on.
 */
export function bodyFitOf(fit: RetargetFit): Omit<RetargetFit, 'matched'> {
  return {
    missingInSource: fit.missingInSource.filter(role => !isFingerRole(role)),
    missingInTarget: fit.missingInTarget.filter(role => !isFingerRole(role)),
  }
}

export function retargetFitOf(
  target: Object3D,
  source: Object3D,
  known?: ReadonlyMap<string, SkeletonProfile>,
): RetargetFit {
  const targetRoles = new Set(Object.values(rolesOf(wireBonesOf(target), known)))
  const sourceRoles = new Set(Object.values(rolesOf(wireBonesOf(source), known)))

  return {
    matched: [...targetRoles].filter(role => sourceRoles.has(role)),
    missingInSource: [...targetRoles].filter(role => !sourceRoles.has(role)),
    missingInTarget: [...sourceRoles].filter(role => !targetRoles.has(role)),
  }
}

/** The wire spells a parent as an index; reading roles wants it as a name. */
function namedBonesOf(bones: readonly WireBone[]): NamedBone[] {
  return bones.map(bone => ({ name: bone.name, parent: bones[bone.parent]?.name ?? null }))
}

/**
 * What each bone MEANS: what its name spells, corrected by whatever was recorded for a skeleton
 * of exactly these bones.
 *
 * A correction wins over a name, because it was made precisely BECAUSE the name lied — and it is
 * laid on one bone at a time so that giving a role to another takes it off whoever held it.
 */
function rolesOf(
  bones: readonly WireBone[],
  known?: ReadonlyMap<string, SkeletonProfile>,
): Record<string, HumanoidRole> {
  const signature = skeletonSignatureOf(bones.map(bone => bone.name))
  const found = boneRolesOf(namedBonesOf(bones))
  const corrections = known?.get(signature)?.roles
  if (!corrections) return found

  let profile: SkeletonProfile = { signature, roles: found }
  for (const [name, role] of Object.entries(corrections)) {
    profile = profileWithRole(profile, name, role)
  }
  return { ...profile.roles }
}

/**
 * How much longer the target's torso is than the source's — the factor the hips' TRAVEL is read
 * at.
 *
 * `retargetClip` carries the hip translation over unchanged unless told otherwise, so a stride
 * authored on a small character replays at its own size on a large one and the feet slide. Hip
 * HEIGHT is the obvious measure and cannot be used: Uthana builds its skeleton with the hips at
 * the ORIGIN, measured on the real file on 2026-08-18 — hips to head is intrinsic to a rig and
 * survives that, as it survives the rest rotations 46 of its 52 bones carry.
 */
export function skeletonScaleOf(target: Object3D, source: Object3D): number {
  const to = torsoLengthOf(target)
  const from = torsoLengthOf(source)

  // A rig with no head, or two bones in one place: reading it as a size would be worse than not.
  return to > 0 && from > 0 ? to / from : 1
}

function torsoLengthOf(root: Object3D): number {
  const roles = boneRolesOf(namedBonesOf(wireBonesOf(root)))
  const hips = boneFilling(root, roles, 'Hips')
  const head = boneFilling(root, roles, 'Head')
  if (!hips || !head) return 0

  root.updateWorldMatrix(false, true)
  return hips.getWorldPosition(new Vector3()).distanceTo(head.getWorldPosition(new Vector3()))
}

function boneFilling(
  root: Object3D,
  roles: Readonly<Record<string, HumanoidRole>>,
  role: HumanoidRole,
): Object3D | undefined {
  const name = Object.keys(roles).find(bone => roles[bone] === role)
  return name === undefined ? undefined : root.getObjectByName(name)
}

/**
 * 🛑 three copies the source bone's WORLD orientation onto the target one and stops there, so two
 * skeletons whose rests differ fold in two — measured 2026-09-01 on a fitted rig whose 22 rests
 * are all the identity, playing a Mixamo motion. `restSource⁻¹ · restTarget` makes it a delta.
 *
 * Both skeletons are read AT REST, so they are the worker's own — never a placed scene node,
 * whose holder would fold its own rotation into every offset.
 */
export function restOffsetsOf(
  target: Object3D,
  source: Object3D,
  names: Readonly<Record<string, string>>,
): Record<string, Matrix4> {
  const turns = worldTurnsOf(target)
  const from = worldTurnsOf(source)

  const offsets: Record<string, Matrix4> = {}
  for (const [bone, other] of Object.entries(names)) {
    const turn = turns.get(bone)
    const rest = from.get(other)
    if (!turn || !rest) continue

    // Cloned: `invert` and `multiply` write in place, and two target bones may name one source
    // bone — the second would then read a rest the first had destroyed.
    offsets[bone] = new Matrix4().makeRotationFromQuaternion(rest.clone().invert().multiply(turn))
  }

  return offsets
}

/**
 * Every named object's world ROTATION, in one walk — `getObjectByName` walks the whole tree per
 * call, and this is asked once per bone of a 52-bone rig. The scale is dropped on purpose: a rig
 * scaled by its holder would otherwise fold that scale into the delta.
 */
function worldTurnsOf(root: Object3D): Map<string, Quaternion> {
  root.updateWorldMatrix(false, true)

  const turns = new Map<string, Quaternion>()
  root.traverse(object => {
    if (object.name && !turns.has(object.name))
      turns.set(object.name, object.getWorldQuaternion(new Quaternion()))
  })

  return turns
}

/**
 * Whether the clips can be played as they are.
 *
 * Names and hierarchy are not enough: two rigs spelled alike but built to different proportions
 * hold their arms elsewhere, and playing one's rotations on the other is precisely the case
 * retargeting exists for. So the rest pose is compared too.
 */
export function sameSkeleton(target: readonly WireBone[], source: readonly WireBone[]): boolean {
  if (target.length !== source.length) return false

  return target.every((bone, index) => {
    const other = source[index]
    if (!other || bone.name !== other.name || bone.parent !== other.parent) return false

    return (
      near(bone.frame ?? IDENTITY_ARRAY, other.frame ?? IDENTITY_ARRAY) &&
      near(bone.position, other.position) &&
      near(bone.quaternion, other.quaternion) &&
      near(bone.scale, other.scale)
    )
  })
}

/**
 * An ABSOLUTE tolerance, which suits a rig measured in metres — the three measured provider files
 * all stand about one unit tall. A rig in centimetres would never short-circuit and would be
 * retargeted instead, which is the safe way round to be wrong.
 */
const REST_TOLERANCE = 1e-6

function near(a: readonly number[], b: readonly number[]): boolean {
  return a.every((value, index) => Math.abs(value - (b[index] ?? 0)) <= REST_TOLERANCE)
}

/**
 * Every named bone of a model, parents before children.
 *
 * Deduplicated by name, like `rigState`: a track and a bone map both address a bone by name, and
 * a second bone of the same name is one nothing can reach.
 */
export function wireBonesOf(root: Object3D): WireBone[] {
  const bones: WireBone[] = []
  const indexOf = new Map<string, number>()
  // Needed by the fold below, and read once: `matrixWorld` is stale on a tree nothing has drawn.
  root.updateWorldMatrix(false, true)
  const above = new Matrix4().copy(root.matrixWorld).invert()

  root.traverse(object => {
    if (!isBoneObject(object) || !object.name || indexOf.has(object.name)) return

    const parent = parentIndexOf(object, indexOf)
    indexOf.set(object.name, bones.length)
    bones.push(parent < 0 ? rootBoneOf(object, above) : localBoneOf(object, parent))
  })

  return bones
}

const localBoneOf = (bone: Object3D, parent: number): WireBone => ({
  name: bone.name,
  parent,
  position: bone.position.toArray(),
  quaternion: bone.quaternion.toArray(),
  scale: bone.scale.toArray(),
})

/**
 * A bone with no bone above it NAMES whatever does — the armature a glTF hangs its rig under being
 * an `Object3D` and not a `Bone`. Dropped, its quarter turn and its centimetres go with it:
 * measured 2026-09-06, a half turn played the head 1,08 m under the feet. See `WireBone.frame`.
 */
function rootBoneOf(bone: Object3D, above: Matrix4): WireBone {
  const frame = new Matrix4().multiplyMatrices(above, bone.parent?.matrixWorld ?? IDENTITY)
  const local = localBoneOf(bone, -1)

  return frame.equals(IDENTITY) ? local : { ...local, frame: frame.toArray() }
}

const IDENTITY = /* @__PURE__ */ new Matrix4()

const IDENTITY_ARRAY: readonly number[] = /* @__PURE__ */ IDENTITY.toArray()

function parentIndexOf(bone: Object3D, indexOf: ReadonlyMap<string, number>): number {
  let above = bone.parent
  while (above) {
    const known = above.name === '' ? undefined : indexOf.get(above.name)
    if (known !== undefined) return known
    above = above.parent
  }
  return -1
}

/** The skeleton three needs to sample a clip: a mesh, because `retargetClip` reads `.skeleton`. */
export function skinnedFromWire(bones: readonly WireBone[]): SkinnedMesh {
  const built = bones.map(wire => {
    const bone = new Bone()
    bone.name = wire.name
    bone.position.fromArray([...wire.position])
    bone.quaternion.fromArray([...wire.quaternion])
    bone.scale.fromArray([...wire.scale])
    return bone
  })

  const mesh = new SkinnedMesh()
  built.forEach((bone, index) => {
    const wire = bones[index]
    const parent = wire?.parent ?? -1
    if (parent >= 0) (built[parent] ?? mesh).add(bone)
    // A NODE and not a fold — see `WireBone.frame`.
    else mesh.add(wire?.frame ? framedNode(wire.frame).add(bone) : bone)
  })

  mesh.updateMatrixWorld(true)
  mesh.bind(new Skeleton(built))
  return mesh
}

function framedNode(frame: readonly number[]): Object3D {
  const node = new Object3D()
  node.matrixAutoUpdate = false
  node.matrix.fromArray(frame)

  return node
}

export function wireClipOf(clip: AnimationClip): WireClip {
  return {
    name: clip.name,
    duration: clip.duration,
    tracks: clip.tracks.map(track => ({
      name: track.name,
      kind: trackKindOf(track),
      times: new Float32Array(track.times),
      values: new Float32Array(track.values),
    })),
  }
}

export function clipFromWire(wire: WireClip): AnimationClip {
  return new AnimationClip(wire.name, wire.duration, wire.tracks.map(trackFromWire))
}

function trackFromWire(track: WireTrack): KeyframeTrack {
  if (track.kind === 'quaternion')
    return new QuaternionKeyframeTrack(track.name, track.times, track.values)
  if (track.kind === 'vector') return new VectorKeyframeTrack(track.name, track.times, track.values)

  return new NumberKeyframeTrack(track.name, track.times, track.values)
}

function trackKindOf(track: KeyframeTrack): WireTrackKind {
  if (track.ValueTypeName === 'quaternion') return 'quaternion'
  return track.ValueTypeName === 'vector' ? 'vector' : 'number'
}

/**
 * `.bones[Hips].quaternion` read as `Hips.quaternion`.
 *
 * `retargetClip` writes the SKELETON spelling, which only binds against an object carrying a
 * `.skeleton`. Every clip this studio plays comes off `GLTFLoader` in the NODE spelling and is
 * bound against the model holder — so a retargeted clip left as three spells it would resolve to
 * nothing, silently, and the character would simply stand still.
 */
export function nodeTrackNameOf(name: string): string {
  const match = /^\.bones\[(.+)\]\.(.+)$/.exec(name)
  return match ? `${match[1]}.${match[2]}` : name
}
