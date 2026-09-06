import { profileOfBones } from '@/engines/scene/retarget'
import { motionProfile } from './retargetDraft'
import type { MotionView } from './components/Retarget/RetargetViewport'
import { profileWithRole, type SkeletonProfile } from '@shared/domain/skeletonProfile'
import type { Rig } from '@shared/domain/rig'

export function withRigRoles(
  profile: SkeletonProfile,
  rig: Rig | null | undefined,
): SkeletonProfile {
  return (rig?.bones ?? []).reduce(
    (held, bone) => (bone.role ? profileWithRole(held, bone.name, bone.role) : held),
    profile,
  )
}

export function profilesConflict(
  source: SkeletonProfile | null,
  target: SkeletonProfile | null,
): boolean {
  return Boolean(
    source &&
    target &&
    source.signature === target.signature &&
    JSON.stringify(source) !== JSON.stringify(target),
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

/** Saved corrections win over detection and rig defaults; legacy identities migrate in the draft. */
export function profileForView(
  view: MotionView | null,
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
