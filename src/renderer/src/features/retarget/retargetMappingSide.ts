import type { HumanoidRole } from '@shared/domain/humanoid'
import type { SkeletonProfile } from '@shared/domain/skeletonProfile'
import { cachedOn } from '@/engines/core/cachedOn'
import type { MotionView } from './components/Retarget/RetargetViewport'

export type RetargetMappingSide = {
  view: MotionView
  profile: SkeletonProfile
  onChange: (profile: SkeletonProfile) => void
}

/**
 * 🛑 The INVERSE of a profile, worked out once per profile. `boneFor` walked its keys, and the
 * mapping panel asks it 104 times for a single render — twice per role of a humanoid, before a
 * single row is drawn. A profile is replaced rather than written to, so its identity is a key,
 * and the entry dies with it.
 */
const inverted = new WeakMap<SkeletonProfile, ReadonlyMap<HumanoidRole, string>>()

const bonesByRole = (profile: SkeletonProfile): ReadonlyMap<HumanoidRole, string> =>
  cachedOn(inverted, profile, () => {
    const made = new Map<HumanoidRole, string>()
    for (const [name, role] of Object.entries(profile.roles))
      if (!made.has(role)) made.set(role, name)
    return made
  })

/** The bone a profile gives a role, or nothing when the role is unmapped. */
export const boneFor = (profile: SkeletonProfile, role: HumanoidRole): string =>
  bonesByRole(profile).get(role) ?? ''
