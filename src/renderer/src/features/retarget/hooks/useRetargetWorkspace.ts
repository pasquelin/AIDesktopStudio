import { versionedUrl } from '@shared/domain/assetAccess'
import { assetVersionOf } from '@/stores/assets'
import { profileForView, confirmedProfiles } from '../retargetProfileDraft'
import { useState } from 'react'
import { assetUrl } from '@shared/domain/asset'
import type { ClipSource } from '@shared/domain/scene'
import type { SkeletonProfile } from '@shared/domain/skeletonProfile'
import { clipSourceUrl } from '@/engines/scene/clipSources'
import type { MotionView } from '../components/Retarget/RetargetViewport'
import { useRetargetSession } from './useRetargetSession'
import { useRetargetPreview } from './useRetargetPreview'
import { exportRetarget } from '../retargetDraft'

export type RetargetWorkspaceState = ReturnType<typeof useRetargetWorkspace>

export function useRetargetWorkspace() {
  const session = useRetargetSession()
  const [chosen, setChosen] = useState<ClipSource | null>(null)
  const [name, setName] = useState('')
  const [source, setSource] = useState<MotionView | null>(null)
  const [sourceLoading, setSourceLoading] = useState(false)
  const [target, setTarget] = useState<MotionView | null>(null)
  const [sourceProfile, setSourceProfile] = useState<SkeletonProfile | null>(null)
  const [targetProfile, setTargetProfile] = useState<SkeletonProfile | null>(null)
  const [clipIndex, setClipIndex] = useState(0)
  const [scale, setScale] = useState<number | undefined>()
  const [rootMotion, setRootMotion] = useState<'travel' | 'inPlace'>('travel')
  const [failure, setFailure] = useState(false)
  const [exporting, setExporting] = useState(false)
  const preview = useRetargetPreview(
    sourceLoading ? null : source,
    target,
    clipIndex,
    sourceProfile,
    targetProfile,
    scale,
    rootMotion,
  )
  const choose = (value: ClipSource, label: string) => {
    preview.cancel()
    session.idle()
    setChosen(value)
    setName(label)
    setClipIndex('clipIndex' in value ? (value.clipIndex ?? 0) : 0)
    setFailure(false)
  }
  const apply = async () => {
    const result = preview.result
    if (!target || !result || !preview.current(result)) return
    setExporting(true)
    try {
      const glb = await exportRetarget(target.bones, result.clip)
      if (!preview.current(result)) return
      session.apply(name, glb, confirmedProfiles(sourceProfile, targetProfile))
    } catch {
      setFailure(true)
    } finally {
      setExporting(false)
    }
  }
  const sourceUrl =
    chosen && session.snapshot
      ? versionedUrl(
          clipSourceUrl(chosen) ?? assetUrl(session.snapshot.assetId),
          assetVersionOf(chosen.kind === 'asset' ? chosen.assetId : session.snapshot.assetId),
        )
      : undefined
  const sourceReady = (view: MotionView | null) => {
    setSourceLoading(view === null)
    if (!view) return
    setSource(view)
    setClipIndex(index => Math.min(index, Math.max(0, view.clips.length - 1)))
    setSourceProfile(profileForView(view, session.snapshot?.profiles))
  }
  const targetReady = (view: MotionView | null) => {
    setTarget(view)
    setTargetProfile(profileForView(view, session.snapshot?.profiles, session.snapshot?.rig))
  }
  return {
    session,
    chosen,
    sourceLoading,
    source,
    target,
    sourceProfile,
    targetProfile,
    setSourceProfile,
    setTargetProfile,
    name,
    setName,
    clipIndex,
    setClipIndex: (index: number) => {
      session.idle()
      setClipIndex(index)
    },
    scale,
    setScale,
    rootMotion,
    setRootMotion,
    failure,
    setFailure,
    exporting,
    preview,
    choose,
    apply,
    sourceUrl,
    sourceReady,
    targetReady,
  }
}
