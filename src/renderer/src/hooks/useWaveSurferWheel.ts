import { useEffect } from 'react'
import { clamp } from '@shared/numeric'
import type { WaveSurferRefs } from './waveSurferEffects'
import { MAX_PX_PER_SECOND, ZOOM_STEP } from './waveSurferEffects'

export function useWaveSurferWheel(container: HTMLDivElement | null, refs: WaveSurferRefs): void {
  const { surferRef, zoomedRef } = refs
  useEffect(() => {
    if (!container) return
    const onWheel = (event: WheelEvent): void => {
      const instance = surferRef.current
      if (!instance) return
      event.preventDefault()
      if (!event.ctrlKey && !event.metaKey) {
        const along = event.shiftKey ? event.deltaY : event.deltaX || event.deltaY
        instance.setScroll(instance.getScroll() + along)
        return
      }
      const duration = instance.getDuration()
      if (duration <= 0) return
      const fitted = Math.min(instance.getWidth() / duration, MAX_PX_PER_SECOND)
      const factor = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP
      zoomedRef.current = clamp((zoomedRef.current || fitted) * factor, fitted, MAX_PX_PER_SECOND)
      instance.zoom(zoomedRef.current)
    }
    container.addEventListener('wheel', onWheel, { passive: false })
    return () => container.removeEventListener('wheel', onWheel)
  }, [container, surferRef, zoomedRef])
}
