import { type CommandId } from '@shared/domain/command'
import { useShortcutLabel } from '@/hooks/useShortcutLabel'
import {
  mdiAlertCircleOutline,
  mdiPause,
  mdiPlay,
  mdiSkipPrevious,
  mdiTelevisionPlay,
  mdiViewSplitVertical,
} from '@mdi/js'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '@/components/EmptyState'
import { MonitorFrame } from '@/components/MonitorFrame'
import { TOOLBAR_LABEL } from '@/components/styles'
import { Timecode } from '@/components/Timecode'
import { Toolbar } from '@/components/Toolbar/Toolbar'
import type { ToolbarItem } from '@/components/Toolbar/tools'
import { createFrameCoalesce } from '@/engines/core/frameCoalesce'
import { createSoundPort } from '@/engines/timeline/soundPort'
import { transports } from '@/engines/timeline/playback'
import { TimelineEngine } from '@/engines/timeline/TimelineEngine'
import type { SequenceState, Us } from '@/engines/timeline/timelineState'
import { useLatest } from '@/hooks/useLatest'
import { useShortcuts } from '@/hooks/useShortcuts'
import { getBridge } from '@/services/bridge'
import { reportFailure } from '@/services/diagnostics'
import { useBinding } from '@/stores/bindings'
import { playbackOf, usePlayback } from '@/stores/playback'
import { useScenes } from '@/stores/scenes'
import { sceneViewsAffectMontage } from '@/stores/sceneViewChrome'
import { useSceneViews } from '@/stores/sceneViews'
import { montageSink } from './montageSink'

/** A consumer GPU offers two to four hardware decoders; two per monitor leaves room to spare. */
const MAX_DECODERS = 2

/**
 * Pictures answer to memory rather than to silicon. Four per monitor, and a sequence mounts two —
 * so eight 4K bitmaps at worst, against the 96 MB `imageCache` holds for the rest of the window.
 * A reasoned number, not a measured one: measuring it wants the application running.
 */
const MAX_PICTURES = 4

export type MonitorProps = {
  /** Identifies this player to the single playback token. */
  owner: string
  title: string
  /** One line under the transport saying what this monitor SHOWS — see `SequenceDocument`. */
  role: string
  sequence: SequenceState
  /** Called on every played frame and on every rewind. */
  onTime: (time: Us) => void
  /** Shown in place of the picture when there is nothing to play. */
  placeholder?: ReactNode
  /** The monitor the space bar drives. One per tab: two would fight over the playback token. */
  keyboard?: boolean
  /**
   * Whether this monitor shows the EDIT, which is what the video return mirrors. Its own prop
   * rather than read off `keyboard`: that one says who hears the space bar, and a return offered
   * on the take being trimmed would be the source monitor copied onto the second screen.
   */
  program?: boolean
  /**
   * The one-clip half beside this monitor, when there is one to show and hide. Absent leaves the
   * button out — the source monitor has no second half of its own to offer.
   */
  clipHalf?: { shown: boolean; onToggle: () => void }
}

/**
 * One viewer: a picture, a transport and a timecode. Both monitors of the Video workspace are
 * this component — source on the left, program on the right, as Premiere and DaVinci have it.
 */
export function Monitor({
  owner,
  title,
  role,
  sequence,
  onTime,
  placeholder,
  keyboard = false,
  program = false,
  clipHalf,
}: MonitorProps) {
  const { t } = useTranslation()
  const hostRef = useRef<HTMLDivElement>(null)
  const engine = useRef<TimelineEngine | null>(null)
  // A ref rather than a dependency: the engine is built once per monitor, and a 3D source opened
  // later still has to be drawn at whatever size the sequence stands at then.
  const frameSize = useRef({
    width: sequence.settings.width,
    height: sequence.settings.height,
  })
  /** Where this monitor stands, for a redraw that no state change of its own asked for. */
  const playhead = useLatest(sequence.playhead)
  const seekCoalesce = useRef(createFrameCoalesce())
  // Published rather than held: the timeline's own bar draws the same transport, and neither of
  // the two trees contains the other — see `stores/playback`.
  const playing = usePlayback(state => playbackOf(state, owner))
  const [unreadable, setUnreadable] = useState(false)

  useEffect(() => {
    const element = hostRef.current
    if (!element) return

    const sound = createSoundPort()
    const created = new TimelineEngine({
      // The 3D is rendered at the SEQUENCE's frame size, never the monitor's: what a montage
      // composites has to be the same picture whichever window is looking at it.
      openSink: montageSink(() => frameSize.current),
      sound,
      // The output is the master clock whenever it runs: driving sound from the frame loop
      // drifts against it audibly in under a minute, and both media then tell a different time.
      audioTime: sound.now,
      maxDecoders: MAX_DECODERS,
      maxPictures: MAX_PICTURES,
      owner,
      onTime,
      onPlayingChange: running => usePlayback.getState().setRunning(owner, running),
      onUnreadable: setUnreadable,
    })

    engine.current = created
    void created.mount(element)
    const coalesce = seekCoalesce.current

    return () => {
      coalesce.cancel()
      created.dispose()
      engine.current = null
      usePlayback.getState().forget(owner)
    }
  }, [owner, onTime])

  // Tracks and settings, never the playhead: `apply` seeks, and a scrub would otherwise decode
  // every frame twice — once here, once from the transport. Read from the ref so this effect
  // does not restart when only the head moved.
  const latestSequence = useLatest(sequence)
  useEffect(() => {
    const held = latestSequence.current
    frameSize.current = { width: held.settings.width, height: held.settings.height }
    engine.current?.apply(held)
  }, [sequence.tracks, sequence.settings, sequence.selectedId, latestSequence])

  useEffect(() => {
    const current = engine.current
    if (!current || current.playing()) return
    seekCoalesce.current.schedule(sequence.playhead, time => {
      const held = engine.current
      if (!held || held.playing()) return
      void held.seek(time)
    })
  }, [sequence.playhead])

  // What makes a 3D clip LIVE: a scene edited in its own tab changes no sequence at all, so
  // nothing above would repaint. Redrawn at the head it already stands on — a scene sink reads
  // the document afresh on every frame, so one seek is the whole of the refresh.
  useEffect(() => {
    const redraw = (): void => {
      void engine.current?.seek(playhead.current)
    }
    const stopScenes = useScenes.subscribe(redraw)
    const stopViews = useSceneViews.subscribe((next, prev) => {
      if (sceneViewsAffectMontage(prev, next)) redraw()
    })
    return () => {
      stopScenes()
      stopViews()
    }
  }, [playhead])

  // Published by name so the timeline strip can drive it: the space bar is pressed on a tool
  // window, and neither tree contains the other.
  useEffect(
    () =>
      transports.register(owner, {
        play: () => engine.current?.play(),
        pause: () => engine.current?.pause(),
        playing: () => engine.current?.playing() ?? false,
      }),
    [owner],
  )

  const toggle = useCallback(() => transports.toggle(owner), [owner])

  /**
   * A WINDOW rather than this element blown up, and it took a measurement to land there: asked on
   * the picture, `requestFullscreen()` neither resolved nor rejected — Chromium hands the request
   * to Electron and, in this window, nothing ever comes back. There was no refusal to report, and
   * a button that stays pressed with nothing on screen is the worst of both.
   *
   * A window is also the better answer to what it is for: it goes on the SECOND screen, beside
   * the studio rather than over it, and one keeps editing while it plays.
   */
  const showReturn = useCallback(() => {
    void getBridge()
      ?.mirror.open()
      .catch(error => reportFailure('sequence.mirror', title, error))
  }, [title])

  const rewind = useCallback(() => {
    engine.current?.pause()
    onTime(0)
  }, [onTime])

  const playPause = useBinding('sequence.playPause')
  const label = useShortcutLabel()

  const mirror = useBinding('sequence.mirror')

  const run = useCallback(
    (command: CommandId) => {
      if (command === 'sequence.playPause') toggle()
      if (command === 'sequence.mirror') showReturn()
    },
    [toggle, showReturn],
  )

  useShortcuts({ scope: 'sequence', enabled: keyboard, onCommand: run })

  const transport: ToolbarItem[] = [
    { id: 'rewind', labelKey: 'transport.rewind', icon: mdiSkipPrevious },
    {
      id: 'play',
      labelKey: playing ? 'transport.pause' : 'transport.play',
      icon: playing ? mdiPause : mdiPlay,
      // Advertised only where it is armed: a tooltip promising a key nothing listens to lies.
      shortcut: keyboard ? label(playPause) : undefined,
    },
    ...(program
      ? [
          {
            id: 'mirror',
            labelKey: 'transport.mirror',
            descriptionKey: 'transport.mirrorHint',
            icon: mdiTelevisionPlay,
            shortcut: label(mirror),
            separatorBefore: true,
          },
        ]
      : []),
    ...(clipHalf
      ? [
          {
            id: 'clipHalf',
            labelKey: 'transport.showSource',
            descriptionKey: 'transport.showSourceHint',
            icon: mdiViewSplitVertical,
            pressed: clipHalf.shown,
            separatorBefore: true,
          },
        ]
      : []),
  ]

  return (
    <MonitorFrame
      role={role}
      toolbar={
        <Toolbar
          orientation="horizontal"
          tools={transport}
          activeTool={playing ? 'play' : undefined}
          onTool={id => {
            if (id === 'rewind') return rewind()
            if (id === 'mirror') return showReturn()
            if (id === 'clipHalf') return clipHalf?.onToggle()
            return toggle()
          }}
          extras={
            <>
              <span className={TOOLBAR_LABEL}>{title}</span>
              <Timecode time={sequence.playhead} fps={sequence.settings.fps} />
            </>
          }
        />
      }
    >
      <div ref={hostRef} className="absolute inset-0" />
      {/* Positioned, like `MaterialDocument` does over its own viewport: the canvas host is
          absolute, so anything left in normal flow is painted under the opaque backdrop. */}
      <div className="pointer-events-none absolute inset-0">
        {/* Ahead of the host's own placeholder: a clip that is there and shows nothing is the
            more precise thing to say about a black picture. */}
        {unreadable ? (
          <EmptyState icon={mdiAlertCircleOutline} message={t('transport.unreadable')} />
        ) : (
          placeholder
        )}
      </div>
    </MonitorFrame>
  )
}
