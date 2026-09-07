import { transports } from '@/engines/timeline/playback'
import { playbackHeadOf, playbackOf, usePlayback } from '@/stores/playback'
import { sequenceOf, sequenceStore, useSequences } from '@/stores/sequences'
import { SequenceActions } from '../SequenceActions'
import { TimelineTransport } from '../Timeline/TimelineTransport'

export type SoundActionsProps = { documentId: string }

/**
 * What a sound montage puts on the panel's title bar: its transport, then the montage tools.
 *
 * The player itself lives in the programme monitor, as the picture pair's does — this row only
 * asks it, through the registry both surfaces share. It used to be owned here, and the reason
 * given was that the Audio workspace had no monitor to hold one; it has two now.
 *
 * The space bar is answered by the monitor, not from here: a strip and a tab both listening on
 * the `sequence` scope would toggle playback twice on one press.
 */
export function SoundActions({ documentId }: SoundActionsProps) {
  const sequence = useSequences(state => sequenceOf(state, documentId))
  const playing = usePlayback(state => playbackOf(state, documentId))
  // The head the clock owns while it runs: the montage stops carrying it as soon as one plays.
  const clockHead = usePlayback(state => playbackHeadOf(state, documentId))

  const rewind = (): void => {
    const store = useSequences.getState()
    transports.get(documentId)?.pause()
    // The same guard the monitor writes its head behind: a document dropped while this row is
    // still mounted would be rebuilt out of the store's default, a picture track and all.
    if (sequenceStore.hasState(store, documentId)) {
      store.replaceView(documentId, { ...sequenceOf(store, documentId), playhead: 0 })
    }
  }

  return (
    <SequenceActions
      documentId={documentId}
      // Sound only: there is nothing here to show a picture on.
      kinds={['audio']}
      lead={
        <TimelineTransport
          playing={playing}
          time={clockHead ?? sequence.playhead}
          fps={sequence.settings.fps}
          onToggle={() => transports.toggle(documentId)}
          onRewind={rewind}
        />
      }
    />
  )
}
