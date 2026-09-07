import { composed, type Command } from '../core/history'
import {
  linkedClipIds,
  selectClip,
  type SequenceSelection,
  type SequenceState,
  type Track,
} from './timelineState'

export const withoutClip = (track: Track, clipId: string): Track => ({
  ...track,
  clips: track.clips.filter(clip => clip.id !== clipId),
})

export const selectionOf = ({ selectedId, selectedTrackId }: SequenceState): SequenceSelection => ({
  selectedId,
  selectedTrackId,
})

export function acrossLink(
  id: string,
  clipId: string,
  make: (state: SequenceState, linkedId: string) => Command<SequenceState> | null,
): Command<SequenceState> {
  let parts: Command<SequenceState>[] | null = null
  let held = false
  let linked: string[] = []
  return {
    id,
    apply: state => {
      linked = linkedClipIds(state, clipId)
      parts ??= linked.flatMap(linkedId => make(state, linkedId) ?? [])
      let current = state
      for (const part of parts) {
        const next = part.apply(current)
        if (next === current) {
          held = false
          return state
        }
        current = next
      }
      held = true
      const moved = current.selectedId
      const ontoTwin = moved !== null && moved !== clipId && linked.includes(moved)
      return ontoTwin ? selectClip(current, clipId) : current
    },
    revert: state => (held && parts ? composed(id, parts).revert(state) : state),
  }
}
