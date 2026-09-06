import { profilesConflict } from '../../retargetProfileDraft'
import { useTranslation } from 'react-i18next'
import { QuietNote } from '@/components/QuietNote'
import { RetargetMapping } from './RetargetMapping'
import type { RetargetWorkspaceState } from '../../hooks/useRetargetWorkspace'
import { RetargetAlignmentProfiles } from './RetargetAlignmentProfiles'

export function RetargetProfiles({
  source,
  target,
  sourceProfile,
  targetProfile,
  setSourceProfile,
  setTargetProfile,
  sourceUrl,
}: RetargetWorkspaceState) {
  const { t } = useTranslation()
  return (
    <>
      {profilesConflict(sourceProfile, targetProfile) && (
        <QuietNote>{t('character.retarget.profileConflict')}</QuietNote>
      )}
      {source && sourceProfile && target && targetProfile && (
        <RetargetMapping
          resetKey={sourceUrl}
          source={{ view: source, profile: sourceProfile, onChange: setSourceProfile }}
          target={{ view: target, profile: targetProfile, onChange: setTargetProfile }}
        />
      )}
      <RetargetAlignmentProfiles
        source={source}
        target={target}
        sourceProfile={sourceProfile}
        targetProfile={targetProfile}
        setSourceProfile={setSourceProfile}
        setTargetProfile={setTargetProfile}
      />
    </>
  )
}
