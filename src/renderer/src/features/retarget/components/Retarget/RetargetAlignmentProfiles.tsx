import { RetargetAlignment } from './RetargetAlignment'
import type { RetargetWorkspaceState } from '../../hooks/useRetargetWorkspace'

export function RetargetAlignmentProfiles({
  source,
  target,
  sourceProfile,
  targetProfile,
  setSourceProfile,
  setTargetProfile,
}: Pick<
  RetargetWorkspaceState,
  'source' | 'target' | 'sourceProfile' | 'targetProfile' | 'setSourceProfile' | 'setTargetProfile'
>) {
  return (
    <>
      {source && sourceProfile && (
        <RetargetAlignment
          side="source"
          bones={source.bones}
          profile={sourceProfile}
          onChange={setSourceProfile}
        />
      )}
      {target && targetProfile && (
        <RetargetAlignment
          side="target"
          bones={target.bones}
          profile={targetProfile}
          onChange={setTargetProfile}
        />
      )}
    </>
  )
}
