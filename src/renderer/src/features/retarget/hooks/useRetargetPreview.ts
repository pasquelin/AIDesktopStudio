import { useEffect, useRef, useState } from 'react'
import type { SkeletonProfile } from '@shared/domain/skeletonProfile'
import { createRetarget, type Retarget } from '@/engines/scene/retarget'
import { adaptWireClip } from '../retargetDraft'
import RetargetWorker from '@/engines/scene/retarget.worker?worker'
import type { MotionView } from '../components/Retarget/RetargetViewport'
import type { WireClip } from '@/engines/scene/retargetMessage'

export type PreviewResult = { key: string; clip: WireClip; generation: number }
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
  const generation = useRef(0)
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
    generation.current += 1
    setResult(null)
    setBusy(false)
    setFailed(false)
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
    const gen = (generation.current += 1)
    setBusy(true)
    setFailed(false)
    try {
      retarget.current ??= createRetarget(() => new RetargetWorker())
      const next = await computePreview(retarget.current, source, target, clip, {
        signal: controller.signal,
        sourceProfile,
        targetProfile,
        options: { scale, rootMotion },
        generation: gen,
        current: () => generation.current,
        installed,
      })
      if (next) setResult(next)
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
    current: (value: PreviewResult | null) =>
      value !== null && value.generation === generation.current,
    cancel: () => {
      abort.current?.abort()
      generation.current += 1
      setResult(null)
      setBusy(false)
    },
  }
}

async function computePreview(
  port: Retarget,
  source: MotionView,
  target: MotionView,
  clip: WireClip,
  watch: {
    signal: AbortSignal
    sourceProfile: SkeletonProfile
    targetProfile: SkeletonProfile
    options: { scale: number | undefined; rootMotion: 'travel' | 'inPlace' }
    generation: number
    current: () => number
    installed: { current: { view: MotionView; key: string } | null }
  },
): Promise<PreviewResult | null> {
  const adapted = await adaptWireClip(port, target.bones, source.bones, clip, watch)
  if (watch.signal.aborted || watch.current() !== watch.generation || !adapted) return null
  const key = `retarget:${crypto.randomUUID()}`
  if (!target.engine.installMotion(target.nodeId, key, adapted))
    throw new Error('model unavailable')
  if (watch.signal.aborted || watch.current() !== watch.generation) {
    target.engine.removeMotion(target.nodeId, key)
    return null
  }
  const previous = watch.installed.current
  watch.installed.current = { view: target, key }
  if (previous) previous.view.engine.removeMotion(previous.view.nodeId, previous.key)
  return { key, clip: adapted, generation: watch.generation }
}
