import type { HumanoidRole, SkeletonProfile } from '@shared/domain/skeletonProfile'
import type { MotionView } from './components/Retarget/RetargetViewport'

export type RetargetMappingSide = {
  view: MotionView
  profile: SkeletonProfile
  onChange: (profile: SkeletonProfile) => void
}

/** The bone a profile gives a role, or nothing when the role is unmapped. */
export const boneFor = (profile: SkeletonProfile, role: HumanoidRole): string =>
  Object.keys(profile.roles).find(name => profile.roles[name] === role) ?? ''
