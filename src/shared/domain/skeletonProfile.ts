/**
 * What is known about a skeleton the studio has already read, keyed by its shape.
 *
 * A mapping corrected by hand must never be asked for twice, and the same rig arrives under many
 * files: two exports of one Uthana character carry the same 22 bone names. The signature is what
 * recognises them as the same skeleton, so a correction made on one applies to the next.
 *
 * Nothing here reaches a disk. A profile derived from bone names alone is recomputed on every
 * load and costs nothing to keep; only a CORRECTION is worth storing, and the screen that
 * produces one does not exist yet.
 */
import { isRecord } from '../guards'
import { digest } from '../hash'
import { byCodeUnit } from '../text'
import { isHumanoidRole, type HumanoidRole } from './humanoid'
import { isTransform, finiteTransform, type Transform } from './transform'

export type SkeletonProfile = {
  /** A fingerprint of the sorted bone names: two files of one rig answer the same. */
  signature: string
  /** Who produced it, to show it — `Uthana`, `Mixamo`, `imported`. */
  provider?: string
  /** Bone name to humanoid role. This is the map retargeting is built from. */
  roles: Readonly<Record<string, HumanoidRole>>
  /** The rest pose, needed to retarget between two skeletons that do not stand alike. */
  restPose?: Readonly<Record<string, Transform>>
}

/**
 * The fingerprint of a set of bone names.
 *
 * Sorted BY CODE UNIT, never by locale: a signature that read the machine's language would answer
 * differently on another machine, and the same rig would stop being recognised. Deduplicated
 * because a name appearing twice can only ever be addressed once.
 */
export function skeletonSignatureOf(boneNames: Iterable<string>): string {
  const sorted = [...new Set(boneNames)].sort(byCodeUnit)

  return `${sorted.length}-${digest(sorted.join('\n'))}`
}

/** A versioned identity for name-based binding, including the hierarchy. */
export function skeletonTopologySignatureOf(
  bones: Iterable<{ name: string; parent: string | null }>,
): string {
  const sorted = [...bones].sort((a, b) => byCodeUnit(a.name, b.name))
  return `v2-${sorted.length}-${digest(JSON.stringify(sorted.map(bone => [bone.name, bone.parent])))}`
}

/**
 * The profile with one bone's role set, or cleared when the role is `null`.
 *
 * Whatever bone held that role loses it in the same move, and that is not tidiness: a rig holding
 * one role twice is a `duplicate-role` fault, which the document reader and every command refuse.
 */
export function profileWithRole(
  profile: SkeletonProfile,
  boneName: string,
  role: HumanoidRole | null,
): SkeletonProfile {
  const roles = Object.fromEntries(
    Object.entries(profile.roles).filter(
      ([name, held]) => name !== boneName && (role === null || held !== role),
    ),
  )

  return { ...profile, roles: role === null ? roles : { ...roles, [boneName]: role } }
}

export function isSkeletonProfile(value: unknown): value is SkeletonProfile {
  if (!isRecord(value)) return false
  if (typeof value.signature !== 'string' || value.signature === '') return false
  if (value.provider !== undefined && typeof value.provider !== 'string') return false
  if (!isRoleMap(value.roles)) return false

  return value.restPose === undefined || isRestPose(value.restPose)
}

function isRoleMap(value: unknown): value is Record<string, HumanoidRole> {
  if (!isRecord(value) || Object.keys(value).some(name => name.length === 0)) return false
  const roles = Object.values(value)
  return roles.every(isHumanoidRole) && new Set(roles).size === roles.length
}

function isRestPose(value: unknown): value is Record<string, Transform> {
  return (
    isRecord(value) &&
    Object.values(value).every(transform => isTransform(transform) && finiteTransform(transform))
  )
}
