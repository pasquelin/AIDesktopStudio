import { useEffect } from 'react'
import { durationOf } from '@/engines/audio/audioData'
import type { RenderedAudio } from '@/engines/audio/audioRender'
import { SECOND } from '@/engines/timeline/timelineState'
import type { WaveSurferRefs } from './waveSurferEffects'

export function useWaveSurferAudio(
  container: HTMLDivElement | null,
  rendered: RenderedAudio | null,
  refs: WaveSurferRefs,
): void {
  const { surferRef, zoomedRef } = refs
  useEffect(() => {
    const instance = surferRef.current
    if (!instance || !rendered) return
    zoomedRef.current = 0
    const blob = new Blob([rendered.wav], { type: 'audio/wav' })
    const load = async (): Promise<void> => {
      try {
        await instance.loadBlob(blob, rendered.data.channels, durationOf(rendered.data) / SECOND)
      } catch {
        // A later render may replace the audio while this load is still in flight.
      }
    }
    void load()
  }, [container, rendered, surferRef, zoomedRef])
}
