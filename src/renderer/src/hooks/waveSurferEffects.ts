import type { MutableRefObject } from 'react'
import type WaveSurfer from 'wavesurfer.js'
import type RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.js'
import type { TimelinePluginOptions } from 'wavesurfer.js/dist/plugins/timeline.js'
import { MAX_SCALE, ZOOM_STEP } from '@/engines/timeline/viewport'
import { SECOND } from '@/engines/timeline/timelineState'
import type { Region } from '@/engines/audio/edits'

export const BAR_WIDTH = 2
export const BAR_GAP = 1
export const BAR_RADIUS = 2
export const CURSOR_WIDTH = 2
export const MAX_PX_PER_SECOND = MAX_SCALE * SECOND
export { ZOOM_STEP }

export type WaveSurferRefs = {
  surferRef: MutableRefObject<WaveSurfer | null>
  zoomedRef: MutableRefObject<number>
  regionsRef: MutableRefObject<ReturnType<typeof RegionsPlugin.create> | null>
}

export type InstanceOptions = WaveSurferRefs & {
  container: HTMLDivElement | null
  owner: string
  timeline: TimelinePluginOptions
  notify: MutableRefObject<(region: Region | null) => void>
  setPlaying: (playing: boolean) => void
  setCurrentTime: (time: number) => void
}

export type PaletteOptions = Pick<InstanceOptions, 'container' | 'surferRef' | 'regionsRef'> & {
  wave: string
  head: string
  veil: string
}
