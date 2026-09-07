import { mdiRepeat } from '@mdi/js'
import { ToolButton } from '@/components/ToolButton'
import { TIP_TOP } from '@/helpers/tooltip'
import { useLatest } from '@/hooks/useLatest'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useFrameLoop } from '@/hooks/useFrameLoop'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/Button'
import { SliderField } from '@/components/SliderField'
import type { MotionView } from './RetargetViewport'
import type { PreviewResult } from '../../hooks/useRetargetPreview'

type Props = {
  source: MotionView | null
  target: MotionView | null
  clipIndex: number
  result: PreviewResult | null
  rootMotion: 'travel' | 'inPlace'
}
export function RetargetTransport({ source, target, clipIndex, result, rootMotion }: Props) {
  const { t } = useTranslation()
  const [looping, setLooping] = useState(true)
  const [playing, setPlaying] = useState(false)
  const [shown, setShown] = useState(0)
  const time = useRef(0)
  const previous = useRef(0)
  const painted = useRef(0)
  const sourceKey = useRef<string | null>(null)
  useEffect(() => {
    const clip = source?.clips[clipIndex]
    if (!source || !clip) return
    const key = `retarget-source:${crypto.randomUUID()}`
    source.engine.installMotion(source.nodeId, key, clip)
    sourceKey.current = key
    return () => {
      if (key in source.engine.clipLengthsOf(source.nodeId))
        source.engine.removeMotion(source.nodeId, key)
      sourceKey.current = null
    }
  }, [source, clipIndex])
  const duration = source?.clips[clipIndex]?.duration ?? 0
  const sample = (seconds: number) => {
    time.current = seconds
    const clip = source?.clips[clipIndex]
    if (
      clip &&
      sourceKey.current &&
      sourceKey.current in source.engine.clipLengthsOf(source.nodeId)
    )
      source?.engine.poseNode(source.nodeId, [
        { key: sourceKey.current, time: seconds, weight: 1, part: 'all', rootMotion },
      ])
    if (target && result && result.key in target.engine.clipLengthsOf(target.nodeId))
      target.engine.poseNode(target.nodeId, [
        { key: result.key, time: seconds, weight: 1, part: 'all', rootMotion },
      ])
  }
  const sampleRef = useLatest(sample)
  useEffect(() => {
    time.current = 0
    setShown(0)
    setPlaying(false)
    sampleRef.current(0)
  }, [source, target, clipIndex, result])
  const step = useCallback(
    (seconds: number) => {
      const now = seconds * 1000
      const next = time.current + Math.max(0, now - previous.current) / 1000
      const played = looping ? next % duration : Math.min(next, duration)
      sampleRef.current(played)
      if (!looping && played >= duration) {
        setShown(duration)
        setPlaying(false)
        return
      }
      previous.current = now
      // The slider repaints ten times a second; the skeletons are posed on every frame.
      if (now - painted.current >= 100) {
        setShown(time.current)
        painted.current = now
      }
    },
    [duration, looping, sampleRef],
  )
  useFrameLoop(playing && duration > 0, step)
  return (
    <div className="flex items-center gap-(--sc-gutter) p-(--sc-gutter)">
      <Button
        disabled={duration <= 0}
        onClick={() => {
          if (!playing && time.current >= duration) sample(0)
          previous.current = painted.current = performance.now()
          setPlaying(!playing)
        }}
      >
        {t(playing ? 'character.retarget.pause' : 'character.retarget.play')}
      </Button>
      <ToolButton
        icon={mdiRepeat}
        label={t('animation.loop')}
        description={t('animation.loopHint')}
        tooltip={TIP_TOP}
        active={looping}
        onClick={() => setLooping(!looping)}
      />
      <div className="min-w-0 flex-1">
        <SliderField
          scId="retarget.time"
          label={t('character.retarget.time')}
          min={0}
          max={duration || 1}
          step={0.01}
          value={shown}
          onChange={value => {
            setPlaying(false)
            sample(value)
            setShown(value)
          }}
        />
      </div>
    </div>
  )
}
