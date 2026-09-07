import { useRef, useState } from 'react'
import type WaveSurfer from 'wavesurfer.js'
import type RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.js'
import type { TimelinePluginOptions } from 'wavesurfer.js/dist/plugins/timeline.js'
import { playbackToken } from '@/engines/timeline/playback'
import { useLatest } from './useLatest'
import { useToken } from './useToken'
import type { RenderedAudio } from '@/engines/audio/audioRender'
import type { Region } from '@/engines/audio/edits'
import { formatDuration } from '@/engines/timeline/timecode'
import { RULER_HEIGHT } from '@/engines/timeline/timelineGeometry'
import { SECOND, type Us } from '@/engines/timeline/timelineState'
import { useWaveSurferAudio } from './useWaveSurferAudio'
import { useWaveSurferInstance } from './useWaveSurferInstance'
import { useWaveSurferPalette } from './useWaveSurferPalette'
import { useWaveSurferWheel } from './useWaveSurferWheel'

export type WaveSurferHandle = {
  playing: boolean
  currentTime: Us
  toggle: () => void
}

export type UseWaveSurferOptions = {
  /**
   * The surface to draw on — the ELEMENT, not a ref holding it. The host only mounts it once a
   * take is loaded, so it is null on the first render of every path in; a ref would not run
   * this hook's effects again when it finally arrives, and nothing would ever be drawn.
   */
  container: HTMLDivElement | null
  /** The take to draw and play, already encoded. Null while it is still being rendered. */
  rendered: RenderedAudio | null
  /** Identifies this player to the single playback token — the document id does. */
  owner: string
  onRegionChange: (region: Region | null) => void
}

/* Bars rather than a continuous line: fewer paths per redraw, and easier to read at a glance. */
/**
 * The graduations above the wave — where the strip and the programme monitor both wear
 * `paintRuler`, this one is wavesurfer's own plugin, the take being drawn by wavesurfer.
 *
 * `RULER_HEIGHT` is the strip's, so the three rulers of an Audio tab stand the same height. Its
 * INK is not set here: the wrapper carries `part="timeline-wrapper"`, so `index.css` dresses it
 * the way it already dresses the region handles — which is what keeps a theme switched with the
 * editor open from leaving this one surface behind, and the values where they belong.
 *
 * Labels through `formatDuration`, the one the editor's own bar announces a selection with. The
 * strip reads timecode in frames; a take has no frame grid of its own to read against.
 */
const TIMELINE: TimelinePluginOptions = {
  height: RULER_HEIGHT,
  insertPosition: 'beforebegin',
  // One label per graduation. The plugin's own default is one every TEN, which on a generated
  // take — five seconds, thirty at most — put a single "00:00.00" at the far left and nothing
  // after it. The graduation itself already adapts to the width, so following it adapts too:
  // a second apart on a short take, a minute apart on a long one.
  primaryLabelInterval: 1,
  formatTimeCallback: seconds => formatDuration(Math.round(seconds * SECOND)),
}

/**
 * Wavesurfer, driven from the edit chain rather than from the file on disk.
 *
 * The peaks are handed over ready-made, so drawing costs no decode; the audible side comes
 * from a blob of the rendered chain, which is what the editor is for — the file on disk is the
 * take before any of it.
 *
 * It also takes the playback token like every other player (spec § 8.7), which is what stops
 * the programme monitor and this editor from being audible at the same time.
 */
export function useWaveSurfer({
  container,
  rendered,
  owner,
  onRegionChange,
}: UseWaveSurferOptions): WaveSurferHandle {
  const surfer = useRef<WaveSurfer | null>(null)
  /** Pixels a second the take is drawn at, or 0 while that is still whatever fits the panel. */
  const zoomed = useRef(0)
  const regions = useRef<ReturnType<typeof RegionsPlugin.create> | null>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState<Us>(0)

  /**
   * The two marks of this surface, and they sit on top of one another: the SELECTION a drag lays
   * down, and the head a click moves. Telling them apart is what these tokens are for — the
   * selection is the accent as a veil, an area; the head is the accent at full, a line. The same
   * opposition the strip below already draws between a selected clip and the playhead.
   *
   * Through `useToken` and not read once on mount: a theme switched with the editor open would
   * otherwise leave this the one surface still wearing the palette it was built under.
   */
  const wave = useToken('--color-muted')
  const head = useToken('--color-accent')
  const veil = useToken('--color-accent-veil')

  // Kept in a ref so the listeners below never have to be re-subscribed when the callback
  // identity changes — a re-subscription mid-drag drops the region being drawn.
  const notify = useLatest(onRegionChange)
  const refs = { surferRef: surfer, zoomedRef: zoomed, regionsRef: regions }
  useWaveSurferInstance({
    ...refs,
    container,
    owner,
    timeline: TIMELINE,
    notify,
    setPlaying,
    setCurrentTime,
  })
  useWaveSurferPalette({ ...refs, container, wave, head, veil })
  useWaveSurferAudio(container, rendered, refs)
  useWaveSurferWheel(container, refs)

  return {
    playing,
    currentTime,

    toggle: () => {
      const instance = surfer.current
      if (!instance) return

      if (instance.isPlaying()) {
        instance.pause()
        return
      }

      // Taking the token revokes whoever held it: two audible streams is the bug this prevents.
      playbackToken.acquire(owner, () => instance.pause())
      void instance.play()
    },
  }
}
