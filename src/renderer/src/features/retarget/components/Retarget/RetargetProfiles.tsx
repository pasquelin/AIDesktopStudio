import { profilesConflict } from '../../retargetProfileDraft'
import { useMemo } from 'react'
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
  // 🛑 Held across renders: written inline they were new objects every time, and every memo below
  // them missed — the workspace redraws on each letter typed into a field three components away.
  const sourceSide = useMemo(
    () =>
      source && sourceProfile
        ? { view: source, profile: sourceProfile, onChange: setSourceProfile }
        : null,
    [source, sourceProfile, setSourceProfile],
  )
  const targetSide = useMemo(
    () =>
      target && targetProfile
        ? { view: target, profile: targetProfile, onChange: setTargetProfile }
        : null,
    [target, targetProfile, setTargetProfile],
  )
  return (
    <>
      {profilesConflict(sourceProfile, targetProfile) && (
        <QuietNote>{t('character.retarget.profileConflict')}</QuietNote>
      )}
      {sourceSide && targetSide && (
        <RetargetMapping resetKey={sourceUrl} source={sourceSide} target={targetSide} />
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
