import { useEffect } from 'react'
import WaveSurfer from 'wavesurfer.js'
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.js'
import TimelinePlugin from 'wavesurfer.js/dist/plugins/timeline.js'
import { playbackToken } from '@/engines/timeline/playback'
import { SECOND } from '@/engines/timeline/timelineState'
import { BAR_GAP, BAR_RADIUS, BAR_WIDTH, type InstanceOptions } from './waveSurferEffects'

export function useWaveSurferInstance(options: InstanceOptions): void {
  const { container, owner, timeline, notify, surferRef, regionsRef, setPlaying, setCurrentTime } =
    options
  useEffect(() => {
    if (!container) return
    const plugin = RegionsPlugin.create()
    const instance = WaveSurfer.create({
      container,
      barWidth: BAR_WIDTH,
      barGap: BAR_GAP,
      barRadius: BAR_RADIUS,
      height: 'auto',
      plugins: [plugin, TimelinePlugin.create(timeline)],
    })
    surferRef.current = instance
    regionsRef.current = plugin
    instance.on('play', () => setPlaying(true))
    instance.on('pause', () => setPlaying(false))
    instance.on('timeupdate', seconds => setCurrentTime(Math.round(seconds * SECOND)))
    const only = (region: { start: number; end: number; remove: () => void }): void => {
      for (const other of plugin.getRegions()) if (other !== region) other.remove()
      notify.current({
        from: Math.round(region.start * SECOND),
        to: Math.round(region.end * SECOND),
      })
    }
    plugin.on('region-created', only)
    plugin.on('region-updated', only)
    return () => {
      playbackToken.release(owner)
      instance.destroy()
      surferRef.current = null
      regionsRef.current = null
      setPlaying(false)
    }
  }, [container, owner, notify, regionsRef, setCurrentTime, setPlaying, surferRef, timeline])
}
