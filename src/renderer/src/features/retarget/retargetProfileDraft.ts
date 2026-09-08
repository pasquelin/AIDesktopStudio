import { profileOfBones } from '@/engines/scene/retarget'
import { sameValues } from '@/helpers/objects'
import { motionProfile } from './retargetDraft'
import type { MotionView } from './components/Retarget/RetargetViewport'
import { profileWithRole, type SkeletonProfile } from '@shared/domain/skeletonProfile'
import type { Rig } from '@shared/domain/rig'

function withRigRoles(profile: SkeletonProfile, rig: Rig | null | undefined): SkeletonProfile {
  return (rig?.bones ?? []).reduce(
    (held, bone) => (bone.role ? profileWithRole(held, bone.name, bone.role) : held),
    profile,
  )
}

export function profilesConflict(
  source: SkeletonProfile | null,
  target: SkeletonProfile | null,
): boolean {
  // 🛑 By value, never by `JSON.stringify`: `profileWithRole` DELETES the rebound key and pushes
  // it back at the end, so two identical profiles read as a conflict after one `choose()` and
  // `confirmedProfiles` then saved none of them.
  return Boolean(
    source && target && source.signature === target.signature && !sameValues(source, target),
  )
}

export function confirmedProfiles(
  source: SkeletonProfile | null,
  target: SkeletonProfile | null,
): SkeletonProfile[] {
  if (profilesConflict(source, target)) return []
  const profiles = new Map<string, SkeletonProfile>()
  for (const profile of [source, target]) if (profile) profiles.set(profile.signature, profile)
  return [...profiles.values()]
}

/**
 * Saved corrections win over detection and rig defaults.
 *
 * 🛑 The one place a v1.0.0 profile becomes a v2 one: it is re-signed with the topology of the
 * skeleton just read — the only moment the parents exist — and `confirmedProfiles` files it under
 * that identity. Nothing on disk carries a hierarchy, so no load-time pass could do this.
 *
 * Asked for the bones alone rather than the whole view: everything else a `MotionView` holds is
 * the engine, and a caller with a list of bones is a legitimate one.
 */
export function profileForView(
  view: Pick<MotionView, 'bones'> | null,
  known: readonly SkeletonProfile[] = [],
  rig?: Rig | null,
): SkeletonProfile | null {
  if (!view) return null
  const detected = motionProfile(view.bones)
  const remembered = profileOfBones(
    view.bones,
    new Map(known.map(profile => [profile.signature, profile])),
  )
  return remembered ? { ...remembered, signature: detected.signature } : withRigRoles(detected, rig)
}
