import type { SkeletonProfile } from '@shared/domain/skeletonProfile'
import type { MotionView } from './components/Retarget/RetargetViewport'

export type RetargetMappingSide = {
  view: MotionView
  profile: SkeletonProfile
  onChange: (profile: SkeletonProfile) => void
}
