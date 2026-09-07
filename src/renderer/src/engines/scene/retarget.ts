/**
 * The port onto the retargeting worker: an animation authored for one skeleton, replayed on
 * another.
 *
 * `skinWeights`'s shape, over the same `workerPort`. What is its own is the short circuit: two
 * identical skeletons need no worker at all, and asking for one would replace an exact clip with
 * a resampled approximation of itself.
 */
import { type AnimationClip, Euler, Matrix4, Quaternion, Vector3, type Object3D } from 'three'
import { isFingerRole, type HumanoidRole } from '@shared/domain/humanoid'
import {
  isSkeletonProfile,
  profileWithRole,
  skeletonTopologySignatureOf,
  skeletonSignatureOf,
  type SkeletonProfile,
} from '@shared/domain/skeletonProfile'
import { boneRolesOf, type NamedBone } from './boneRoles'
import {
  clipBuffers,
  type RetargetOptions,
  type RetargetRequest,
  type RetargetResponse,
  type WireBone,
  type WireClip,
} from './retargetMessage'
import { clipFromWire, wireBonesOf, wireClipOf } from './retargetWire'
export {
  clipFromWire,
  wireBonesOf,
  wireClipOf,
  skinnedFromWire,
  nodeTrackNameOf,
} from './retargetWire'
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
    watch?: {
      onProgress?: (progress: number) => void
      signal?: AbortSignal
      profiles?: readonly SkeletonProfile[]
      sourceProfile?: SkeletonProfile
      targetProfile?: SkeletonProfile
      options?: RetargetOptions
    },
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
  /** The profile a signature is remembered under, if any. */
  profileOf: (signature: string) => SkeletonProfile | undefined
  dispose: () => void
}

export function createRetarget(spawn: () => Worker): Retarget {
  const port = createWorkerPort<readonly WireClip[], RetargetResponse>(
    spawn,
    'retargeting',
    answer => answer.clips,
    true,
  )
  const profiles = new Map<string, SkeletonProfile>()

  return {
    adapt: async (target, source, clips, watch) => {
      if (port.isGone() || watch?.signal?.aborted) return null

      const targetKnown = profilesFor(profiles, watch?.profiles, watch?.targetProfile)
      const sourceKnown = profilesFor(profiles, watch?.profiles, watch?.sourceProfile)
      validateOptions(watch?.options)
      const targetBones = alignedBonesOf(wireBonesOf(target), targetKnown)
      const sourceBones = alignedBonesOf(wireBonesOf(source), sourceKnown)
      if (exactReplay(targetBones, sourceBones, targetKnown, sourceKnown, watch?.options))
        return [...clips]

      const originalTargetProfile = profileOfBones(targetBones, profiles)
      const originalSourceProfile = profileOfBones(sourceBones, profiles)
      const plan = retargetPlanOf(
        targetBones,
        sourceBones,
        clips.map(wireClipOf),
        undefined,
        targetKnown,
        sourceKnown,
      )
      const adapted = await port.send(id => {
        const request: RetargetRequest = { id, ...plan, options: watch?.options }
        return { message: request, transfer: clipBuffers(request.clips) }
      }, watch)

      if (
        originalTargetProfile !== profileOfBones(targetBones, profiles) ||
        originalSourceProfile !== profileOfBones(sourceBones, profiles)
      )
        return null
      return adapted && adapted.map(clipFromWire)
    },

    fitOf: (target, source) => retargetFitOf(target, source, profiles),

    remember: profile => rememberProfile(profiles, profile),

    profileOf: signature => profiles.get(signature),

    dispose: () => {
      profiles.clear()
      port.dispose()
    },
  }
}

function validateOptions(options?: RetargetOptions): void {
  if (options?.scale !== undefined && (!Number.isFinite(options.scale) || options.scale <= 0))
    throw new Error('retarget scale must be finite and positive')
}

function profilesFor(
  known: ReadonlyMap<string, SkeletonProfile>,
  common: readonly SkeletonProfile[] = [],
  override?: SkeletonProfile,
): Map<string, SkeletonProfile> {
  const profiles = new Map(known)
  for (const profile of common) rememberProfile(profiles, profile)
  if (override) rememberProfile(profiles, override)
  return profiles
}

function exactReplay(
  target: readonly WireBone[],
  source: readonly WireBone[],
  targetKnown: ReadonlyMap<string, SkeletonProfile>,
  sourceKnown: ReadonlyMap<string, SkeletonProfile>,
  options?: RetargetOptions,
): boolean {
  const to = profileOfBones(target, targetKnown)
  const from = profileOfBones(source, sourceKnown)
  return (
    sameSkeleton(target, source) &&
    options?.scale === undefined &&
    options?.rootMotion !== 'inPlace' &&
    !to?.ignored?.length &&
    !from?.ignored?.length &&
    JSON.stringify(to?.roles) === JSON.stringify(from?.roles)
  )
}

/**
 * A file's own roles laid over what the project already corrected for that rig: the exclusions
 * and the aligned rest pose only a window can set survive, minus any bone the file now names.
 */
export function rigProfileOf(
  signature: string,
  roles: Readonly<Record<string, HumanoidRole>>,
  held?: SkeletonProfile,
): SkeletonProfile {
  const ignored = held?.ignored?.filter(name => !(name in roles))
  return {
    signature,
    roles: { ...roles },
    ...(held?.provider && { provider: held.provider }),
    ...(held?.restPose && { restPose: held.restPose }),
    ...(ignored?.length && { ignored }),
  }
}

function rememberProfile(profiles: Map<string, SkeletonProfile>, profile: SkeletonProfile): void {
  if (!isSkeletonProfile(profile)) throw new Error('invalid skeleton profile')
  if (JSON.stringify(profiles.get(profile.signature)) === JSON.stringify(profile)) return
  profiles.set(profile.signature, profile)
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
  sourceKnown = known,
): Omit<RetargetRequest, 'id'> {
  const sourceRoles = rolesOf(source, sourceKnown)
  const sourceByRole = new Map(Object.entries(sourceRoles).map(([name, role]) => [role, name]))
  const sourceNames = new Set(source.map(bone => bone.name))

  const names: Record<string, string> = {}
  const excluded = new Set([
    ...(profileOfBones(target, known)?.ignored ?? []),
    ...(profileOfBones(source, sourceKnown)?.ignored ?? []),
  ])
  for (const bone of target)
    if (sourceNames.has(bone.name) && !excluded.has(bone.name)) names[bone.name] = bone.name

  for (const [name, role] of Object.entries(rolesOf(target, known))) {
    const from = sourceByRole.get(role)
    if (from) names[name] = from
  }

  const targetByRole = new Map(
    Object.entries(rolesOf(target, known)).map(([name, role]) => [role, name]),
  )
  const torso = torsoOf(targetByRole, sourceByRole)
  return {
    target,
    source,
    clips,
    names,
    hip: sourceByRole.get('Hips'),
    fps,
    ...(torso && { torso }),
  }
}

function torsoOf(
  target: ReadonlyMap<HumanoidRole, string>,
  source: ReadonlyMap<HumanoidRole, string>,
): RetargetRequest['torso'] | undefined {
  const named = [target, source].map(side => [side.get('Hips'), side.get('Head')])
  const [to, from] = named
  return to?.[0] && to[1] && from?.[0] && from[1]
    ? { target: [to[0], to[1]], source: [from[0], from[1]] }
    : undefined
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
export function namedBonesOf(bones: readonly WireBone[]): NamedBone[] {
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
  for (const name of profileOfBones(bones, known)?.ignored ?? []) delete found[name]
  const corrections = profileOfBones(bones, known)?.roles
  if (!corrections) return found

  let profile: SkeletonProfile = { signature, roles: found }
  const names = new Set(bones.map(bone => bone.name))
  for (const [name, role] of Object.entries(corrections)) {
    if (!names.has(name)) continue
    profile = profileWithRole(profile, name, role)
  }
  return { ...profile.roles }
}

export function profileOfBones(
  bones: readonly WireBone[],
  known?: ReadonlyMap<string, SkeletonProfile>,
): SkeletonProfile | undefined {
  return (
    known?.get(skeletonTopologySignatureOf(namedBonesOf(bones))) ??
    known?.get(skeletonSignatureOf(bones.map(bone => bone.name)))
  )
}

function alignedBonesOf(
  bones: WireBone[],
  known: ReadonlyMap<string, SkeletonProfile>,
): WireBone[] {
  const restPose = profileOfBones(bones, known)?.restPose
  if (!restPose) return bones
  return bones.map(bone => {
    const rest = restPose[bone.name]
    if (!rest) return bone
    // Rotation only: a signature names a rig, and the proportions belong to each file of it.
    return {
      ...bone,
      quaternion: new Quaternion()
        .setFromEuler(new Euler(rest.rotation.x, rest.rotation.y, rest.rotation.z))
        .toArray(),
    }
  })
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
export function skeletonScaleOf(
  target: Object3D,
  source: Object3D,
  torso?: RetargetRequest['torso'],
): number {
  const to = torsoLengthOf(target, torso?.target)
  const from = torsoLengthOf(source, torso?.source)

  // A rig with no head, or two bones in one place: reading it as a size would be worse than not.
  return to > 0 && from > 0 ? to / from : 1
}

function torsoLengthOf(root: Object3D, named?: readonly [string, string]): number {
  const roles = named ? undefined : boneRolesOf(namedBonesOf(wireBonesOf(root)))
  const hips = named ? root.getObjectByName(named[0]) : roles && boneFilling(root, roles, 'Hips')
  const head = named ? root.getObjectByName(named[1]) : roles && boneFilling(root, roles, 'Head')
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
      near(bone.scale, other.scale) &&
      sameFrames(bone.parentFrames ?? [], other.parentFrames ?? [])
    )
  })
}

/**
 * An ABSOLUTE tolerance, which suits a rig measured in metres — the three measured provider files
 * all stand about one unit tall. A rig in centimetres would never short-circuit and would be
 * retargeted instead, which is the safe way round to be wrong.
 */
const REST_TOLERANCE = 1e-6
const IDENTITY_ARRAY: readonly number[] = /* @__PURE__ */ new Matrix4().toArray()

function near(a: readonly number[], b: readonly number[]): boolean {
  return a.every((value, index) => Math.abs(value - (b[index] ?? 0)) <= REST_TOLERANCE)
}

function sameFrames(
  a: readonly Pick<WireBone, 'position' | 'quaternion' | 'scale'>[],
  b: readonly Pick<WireBone, 'position' | 'quaternion' | 'scale'>[],
): boolean {
  return (
    a.length === b.length &&
    a.every((frame, index) => {
      const other = b[index]
      return (
        other !== undefined &&
        near(frame.position, other.position) &&
        near(frame.quaternion, other.quaternion) &&
        near(frame.scale, other.scale)
      )
    })
  )
}
