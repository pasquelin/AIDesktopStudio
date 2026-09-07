import { mdiVideoOutline } from '@mdi/js'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '@/components/EmptyState'
import { ResizeHandle } from '@/components/ResizeHandle'
import { programOwner, sourceOwner } from '@/engines/timeline/playback'
import {
  EMPTY_SEQUENCE,
  frameDuration,
  makeTrack,
  trackOfClip,
  type SequenceState,
  type Us,
} from '@/engines/timeline/timelineState'
import { clamp } from '@shared/numeric'
import { useDocumentIsInFront } from '@/stores/documents'
import { isClipMonitorShown, useMonitorPair } from '@/stores/monitorPair'
import { reportMontageHead } from '@/helpers/reportMontageHead'
import { playbackHeadOf, playbackOf, usePlayback } from '@/stores/playback'
import { mirrorMessageOf, openMirrorChannel } from './mirrorChannel'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useLatest } from '@/hooks/useLatest'
import { isSequenceDirty, sequenceOf, useSequences } from '@/stores/sequences'
import { Monitor } from './Monitor'
import { useRestoredDocument } from '@/hooks/useRestoredDocument'
import { useSplitPair } from '@/hooks/useSplitPair'

export type SequenceDocumentProps = { documentId: string }

/**
 * Two monitors, Premiere and DaVinci convention: source on the left, program on the right. The
 * montage itself is the `timeline` tool window — a strip the width of the app, not a corner of
 * this tab.
 */
export function SequenceDocument({ documentId }: SequenceDocumentProps) {
  const { t } = useTranslation()
  const sequence = useSequences(state => sequenceOf(state, documentId))
  const clockHead = usePlayback(state => playbackHeadOf(state, documentId))
  const program = sequenceAt(sequence, clockHead)
  const active = useDocumentIsInFront(documentId)

  useDocumentTitle(
    documentId,
    useSequences(state => isSequenceDirty(state, documentId)),
  )

  useRestoredDocument(documentId)

  const { pairRef, leadStyle, leadSize, onLeadSize } = useSplitPair('horizontal')

  /**
   * What the video return shows, published from the tab in FRONT only. Two open sequences would
   * otherwise fight over one window, each posting its own edit — and the return would show
   * whichever tab last re-rendered rather than the one being worked on.
   *
   * The whole sequence on every change, the playhead alone on every move: a scrub posts a few
   * hundred times a second, and re-posting every track with each would be the one thing making
   * the return cost anything. `mirrorChannel` says why this does not go through the bridge.
   */
  const channel = useRef<BroadcastChannel | null>(null)
  /** The last state posted, so a playhead that moved alone is not sent as a whole edit. */
  const posted = useRef<SequenceState | null>(null)

  useEffect(() => {
    if (!active) return

    const opened = openMirrorChannel()
    channel.current = opened
    // The return opens after all this was published, and asks for it — see `mirrorChannel`.
    opened.onmessage = event => {
      const asked = mirrorMessageOf(event.data)?.kind === 'ask'
      if (asked && posted.current) opened.postMessage({ kind: 'edit', sequence: posted.current })
    }
    // Nothing left to mirror once the tab goes: the return says so rather than freezing on the
    // last frame of an edit that is no longer open.
    return () => {
      opened.postMessage({ kind: 'gone' })
      opened.close()
      channel.current = null
    }
  }, [active])

  useEffect(() => {
    const opened = channel.current
    if (!opened) return

    const last = posted.current
    posted.current = sequence
    // Identity, not equality: the store replaces the objects it changes, so three references
    // answer "is this the same edit with the playhead somewhere else" without walking a clip.
    const sameEdit = sameSequenceEdit(last, sequence)

    if (sameEdit) opened.postMessage({ kind: 'time', playhead: sequence.playhead })
    else opened.postMessage({ kind: 'edit', sequence })
  }, [sequence])

  // Its own message because the return runs its OWN transport from here: sixty seeks a second
  // would have it decoding at random while the studio plays the same frames in order.
  const running = usePlayback(state => playbackOf(state, programOwner(documentId)))
  // Written from an effect and not during the render, which React forbids: what it holds is where
  // playback starts FROM, so that pressing play does not make this fire on every frame after.
  const playhead = useLatest(sequence.playhead)

  useEffect(() => {
    channel.current?.postMessage({ kind: 'playing', playing: running, playhead: playhead.current })
  }, [running, playhead])

  // Found through its track, not by id alone: the montage's own answer to "is this a sound?" is
  // the track the clip sits on, and the inspector and the program monitor both read it there.
  const holder = sequence.selectedId ? trackOfClip(sequence, sequence.selectedId) : null
  const selected = holder?.clips.find(clip => clip.id === sequence.selectedId) ?? null

  const owner = sourceOwner(documentId)
  const sourcePlaying = usePlayback(state => playbackOf(state, owner))

  /**
   * Which of the two monitors the space bar drives — taken by clicking one, and the programme
   * until somebody does.
   *
   * The programme by default because that is what a montage is FOR: a space bar pressed with
   * nothing aimed at plays the edit, never the take. Only one of them is ever armed, so the key
   * cannot start both — and neither can anything else, `playbackToken` revoking whoever held it.
   *
   * It shows without being drawn: a monitor advertises the key on its play button only while it
   * is the one listening (`shortcut` in `Monitor`), so the armed one says so and the other does
   * not claim a key that would go elsewhere.
   */
  const [focus, setFocus] = useState<'source' | 'program'>('program')

  const sourceShown = useMonitorPair(state => isClipMonitorShown(state, documentId))
  const toggleSource = useCallback(
    () => useMonitorPair.getState().toggleClipMonitor(documentId),
    [documentId],
  )
  // Derived rather than written back: with the source hidden the space bar has one monitor to
  // drive, and a `focus` left on `source` would send it to a player nobody can see.
  const armed = sourceShown ? focus : 'program'

  /**
   * Where the montage's head falls INSIDE the selected clip, which is what following it comes to.
   *
   * Clamped to the clip: the head is often outside it, and the take has no frame to show for a
   * moment it does not span. A frame short of the end, since a clip spans up to but not
   * including it — landing exactly on the end shows nothing at all.
   */
  const followedTime: Us = useMemo(() => {
    if (!selected) return 0
    const last = Math.max(0, selected.duration - frameDuration(sequence.settings))
    return clamp(sequence.playhead - selected.start, 0, last)
  }, [selected, sequence.playhead, sequence.settings])

  /**
   * Where the source monitor stands. One state, written by the two things that move it: its own
   * transport, through `onTime` below, and the montage's head through the adjustment underneath.
   */
  const [sourceTime, setSourceTime] = useState<Us>(followedTime)
  /**
   * The head and the take this has ALREADY been moved for, which is what keeps the two writers
   * from fighting: following applies once per montage move rather than on every render, so a
   * position the monitor itself reported — rewinding to zero — holds until the head moves again.
   * Recomputing it unconditionally instead put the take straight back onto the montage, and the
   * source monitor's rewind button did nothing whatever.
   */
  const [followed, setFollowed] = useState({
    head: sequence.playhead,
    clipId: selected?.id ?? null,
  })

  /**
   * The source follows the montage's own head, offset into the clip — which is what makes it a
   * way to SEE the clip you picked even when a track above covers it, rather than a picture of
   * its first frame and nothing else.
   *
   * While NEITHER of them is playing, and that is the whole of the rule.
   *
   * Not while the source plays, because pressing play there runs the whole take from where it
   * stands and recentring it every frame would fight its own transport. And not while the
   * PROGRAMME plays either: the head then moves sixty times a second, so following it would
   * animate both pictures at once — two decodes, and for a scene clip two whole 3D renders per
   * frame, to show twice what one monitor is already showing. Following is for scrubbing.
   *
   * It catches up the moment playback stops, the head having moved meanwhile.
   *
   * Adjusted during the render rather than from an effect, which React runs only after painting
   * the frame the take had not moved to yet.
   */
  const clipId = selected?.id ?? null
  const playing = sourcePlaying || running
  if (shouldFollow(playing, followed, sequence.playhead, clipId)) {
    setFollowed({ head: sequence.playhead, clipId })
    setSourceTime(followedTime)
  }

  // The source monitor plays one clip, which is a sequence of one — same engine, same painter.
  const source: SequenceState = useMemo(
    () => ({
      ...EMPTY_SEQUENCE,
      settings: sequence.settings,
      playhead: sourceTime,
      tracks:
        holder && selected
          ? [
              makeTrack({
                id: 'S1',
                // Mounted on a picture track, a take is shown as a black frame and heard as
                // nothing at all: `audioChunksIn` only schedules tracks of the sound kind.
                kind: holder.kind,
                index: 1,
                locked: true,
                clips: [{ ...selected, start: 0 }],
              }),
            ]
          : [],
    }),
    [holder, selected, sequence.settings, sourceTime],
  )

  const setProgramTime = useCallback(
    (playhead: Us) => reportMontageHead(documentId, programOwner(documentId), playhead),
    [documentId],
  )

  function Monitors() {
    return (
      // The inset belongs to the ROW, not to each monitor: carried by both, it doubled around the
      // handle and the pair read as two panes pushed apart rather than as two panels side by side.
      <div ref={pairRef} className="flex h-full min-h-0 p-(--sc-gutter)">
        {sourceShown && (
          <>
            {/* Fixed width once it has been dragged, an equal share until then: a document opens on
              two monitors of the same size, and only a gesture makes one of them the wide one. */}
            <div
              className="flex min-w-0"
              style={leadStyle}
              onPointerDown={() => setFocus('source')}
            >
              <Monitor
                owner={owner}
                title={t('transport.source')}
                role={t('transport.sourceRole')}
                sequence={source}
                onTime={setSourceTime}
                keyboard={active && armed === 'source'}
                placeholder={
                  selected ? null : (
                    <EmptyState icon={mdiVideoOutline} message={t('transport.noClip')} />
                  )
                }
              />
            </div>

            {/* The same handle the shell splits its zones with, so the gesture is the one gesture.
              It replaces a `Separator`, which drew the line and refused to be moved. */}
            <ResizeHandle axis="horizontal" size={leadSize} onSize={onLeadSize} />
          </>
        )}

        <div className="flex min-w-0 flex-1" onPointerDown={() => setFocus('program')}>
          <Monitor
            owner={programOwner(documentId)}
            title={t('transport.program')}
            role={t('transport.programRole')}
            sequence={program}
            onTime={setProgramTime}
            keyboard={active && armed === 'program'}
            program
            clipHalf={{ shown: sourceShown, onToggle: toggleSource }}
          />
        </div>
      </div>
    )
  }
  return <>{Monitors()}</>
}

function sequenceAt(sequence: SequenceState, head: Us | undefined): SequenceState {
  return head === undefined ? sequence : { ...sequence, playhead: head }
}

function sameSequenceEdit(last: SequenceState | null, sequence: SequenceState): boolean {
  return (
    last !== null &&
    last.tracks === sequence.tracks &&
    last.settings === sequence.settings &&
    last.selectedId === sequence.selectedId
  )
}

function shouldFollow(
  playing: boolean,
  followed: { head: Us; clipId: string | null },
  head: Us,
  clipId: string | null,
): boolean {
  return !playing && (followed.head !== head || followed.clipId !== clipId)
}
