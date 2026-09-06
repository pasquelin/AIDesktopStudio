/** Corrections remembered across files of one skeleton; legacy name-only identities remain readable. */
import { isRecord } from '../guards'
import { digest } from '../hash'
import { byCodeUnit } from '../text'
import { isHumanoidRole, type HumanoidRole } from './humanoid'
import { isTransform, finiteTransform, type Transform } from './transform'

export type SkeletonProfile = {
  /** New profiles include topology; older saved profiles may identify names alone. */
  signature: string
  /** Who produced it, to show it — `Uthana`, `Mixamo`, `imported`. */
  provider?: string
  /** Bone name to humanoid role. This is the map retargeting is built from. */
  roles: Readonly<Record<string, HumanoidRole>>
  /** Bones explicitly excluded from automatic matching. */
  ignored?: readonly string[]
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

  const ignored = new Set(profile.ignored)
  if (role === null) ignored.add(boneName)
  else ignored.delete(boneName)
  return {
    ...profile,
    roles: role === null ? roles : { ...roles, [boneName]: role },
    ignored: [...ignored],
  }
}

export function isSkeletonProfile(value: unknown): value is SkeletonProfile {
  if (!isRecord(value)) return false
  if (typeof value.signature !== 'string' || value.signature === '') return false
  if (value.provider !== undefined && typeof value.provider !== 'string') return false
  const roles = value.roles
  if (!isRoleMap(roles)) return false
  if (
    value.ignored !== undefined &&
    (!Array.isArray(value.ignored) ||
      !value.ignored.every(
        name => typeof name === 'string' && name.length > 0 && !(name in roles),
      ) ||
      new Set(value.ignored).size !== value.ignored.length)
  )
    return false

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
