import { programOwner, transports } from '@/engines/timeline/playback'
import { playbackHeadOf, playbackOf, usePlayback } from '@/stores/playback'
import { sequenceOf, sequenceStore, useSequences } from '@/stores/sequences'
import { TimelineTransport } from './Timeline/TimelineTransport'

export type ProgramTransportProps = { documentId: string }

/**
 * The montage's transport, driving the programme monitor from the timeline's own bar.
 *
 * It owns no player: the picture is the monitor's, and two `TimelineEngine`s on one sequence
 * would fight over the playback token. It asks the one that exists, BY NAME — which is what
 * `transports` is for, and the same road the space bar already takes from this very panel.
 */
export function ProgramTransport({ documentId }: ProgramTransportProps) {
  const sequence = useSequences(state => sequenceOf(state, documentId))
  const owner = programOwner(documentId)
  const playing = usePlayback(state => playbackOf(state, owner))
  const clockHead = usePlayback(state => playbackHeadOf(state, documentId))

  return (
    <TimelineTransport
      playing={playing}
      time={clockHead ?? sequence.playhead}
      fps={sequence.settings.fps}
      onToggle={() => transports.toggle(owner)}
      onRewind={() => {
        transports.get(owner)?.pause()
        // Through `replace`, outside the history, exactly as the monitor writes its own head:
        // moving the playhead is not an edit.
        const store = useSequences.getState()
        if (!sequenceStore.hasState(store, documentId)) return
        // Handed back, not published: the montage below carries the zero this writes.
        usePlayback.getState().clearHead(documentId)
        store.replaceView(documentId, { ...sequenceOf(store, documentId), playhead: 0 })
      }}
    />
  )
}
