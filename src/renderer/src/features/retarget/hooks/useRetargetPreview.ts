import { useEffect, useRef, useState } from 'react'
import type { SkeletonProfile } from '@shared/domain/skeletonProfile'
import { createRetarget, type Retarget } from '@/engines/scene/retarget'
import { adaptWireClip } from '../retargetDraft'
import RetargetWorker from '@/engines/scene/retarget.worker?worker'
import type { MotionView } from '../RetargetViewport'
import type { WireClip } from '@/engines/scene/retargetMessage'

export type PreviewResult = { key: string; clip: WireClip }
export function useRetargetPreview(
  source: MotionView | null,
  target: MotionView | null,
  clipIndex: number,
  sourceProfile: SkeletonProfile | null,
  targetProfile: SkeletonProfile | null,
  scale: number | undefined,
  rootMotion: 'travel' | 'inPlace',
) {
  const retarget = useRef<Retarget | null>(null)
  const abort = useRef<AbortController | null>(null)
  const installed = useRef<{ view: MotionView; key: string } | null>(null)
  const clear = () => {
    if (installed.current)
      installed.current.view.engine.removeMotion(
        installed.current.view.nodeId,
        installed.current.key,
      )
    installed.current = null
  }
  const [result, setResult] = useState<PreviewResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    abort.current?.abort()
    clear()
    setResult(null)
    setBusy(false)
    setFailed(false)
    target?.engine.releaseNode(target.nodeId)
  }, [source, target, clipIndex, sourceProfile, targetProfile, scale, rootMotion])
  useEffect(
    () => () => {
      abort.current?.abort()
      retarget.current?.dispose()
      retarget.current = null
      clear()
    },
    [],
  )
  const preview = async () => {
    const clip = source?.clips[clipIndex]
    if (!source || !target || !clip || !sourceProfile || !targetProfile) return
    abort.current?.abort()
    const controller = new AbortController()
    abort.current = controller
    clear()
    setResult(null)
    setBusy(true)
    setFailed(false)
    try {
      retarget.current ??= createRetarget(() => new RetargetWorker())
      const adapted = await adaptWireClip(retarget.current, target.bones, source.bones, clip, {
        signal: controller.signal,
        sourceProfile,
        targetProfile,
        options: { scale, rootMotion },
      })
      if (controller.signal.aborted || !adapted) return
      const key = `retarget:${crypto.randomUUID()}`
      if (!target.engine.installMotion(target.nodeId, key, adapted))
        throw new Error('model unavailable')
      installed.current = { view: target, key }
      setResult({ key, clip: adapted })
    } catch {
      if (!controller.signal.aborted) setFailed(true)
    } finally {
      if (abort.current === controller) setBusy(false)
    }
  }
  return {
    result,
    busy,
    failed,
    preview,
    cancel: () => {
      abort.current?.abort()
      setBusy(false)
    },
  }
}
