import type { Command } from '../core/history'
import {
  makeTrack,
  nextTrackId,
  reindexTracks,
  trackById,
  updateTrack,
  type SequenceSelection,
  type SequenceState,
  type Track,
  type TrackKind,
} from './timelineState'

const selectionOf = ({ selectedId, selectedTrackId }: SequenceState): SequenceSelection => ({
  selectedId,
  selectedTrackId,
})

export function addTrack(kind: TrackKind): Command<SequenceState> {
  let added: string | null = null
  return {
    id: `track:add:${kind}`,
    apply: state => {
      const id = nextTrackId(state.tracks, kind)
      added = id
      return {
        ...state,
        tracks: reindexTracks([...state.tracks, makeTrack({ id, kind, index: 0 })]),
      }
    },
    revert: state =>
      added === null
        ? state
        : {
            ...state,
            tracks: reindexTracks(state.tracks.filter(track => track.id !== added)),
          },
  }
}

export function removeTrack(trackId: string): Command<SequenceState> {
  let before: { position: number; track: Track; selection: SequenceSelection } | null = null
  return {
    id: `track:remove:${trackId}`,
    apply: state => {
      const position = state.tracks.findIndex(track => track.id === trackId)
      const track = state.tracks[position]
      if (!track || track.locked) return state
      before = { position, track, selection: selectionOf(state) }
      return {
        ...state,
        tracks: reindexTracks(state.tracks.filter(current => current.id !== trackId)),
        selectedId: track.clips.some(clip => clip.id === state.selectedId)
          ? null
          : state.selectedId,
        selectedTrackId: state.selectedTrackId === trackId ? null : state.selectedTrackId,
      }
    },
    revert: state => {
      if (!before) return state
      const tracks = [...state.tracks]
      tracks.splice(before.position, 0, before.track)
      return { ...state, tracks: reindexTracks(tracks), ...before.selection }
    },
  }
}

const reorder = (tracks: readonly Track[], position: number, to: number): Track[] => {
  const track = tracks[position]
  if (!track) return [...tracks]
  const moved = tracks.filter((_, at) => at !== position)
  moved.splice(to, 0, track)
  return reindexTracks(moved)
}

export function moveTrack(trackId: string, by: number): Command<SequenceState> {
  let from: number | null = null
  let target: number | null = null
  return {
    id: `track:move:${trackId}`,
    apply: state => {
      const position = state.tracks.findIndex(track => track.id === trackId)
      const to = target ?? position + by
      if (position < 0 || to < 0 || to >= state.tracks.length) return state
      from ??= position
      target = to
      return { ...state, tracks: reorder(state.tracks, position, to) }
    },
    revert: state => {
      if (from === null) return state
      const position = state.tracks.findIndex(track => track.id === trackId)
      return position < 0 ? state : { ...state, tracks: reorder(state.tracks, position, from) }
    },
  }
}

export function renameTrack(trackId: string, name: string): Command<SequenceState> {
  let before: string | null = null
  return {
    id: `rename:${trackId}`,
    apply: state => {
      const track = trackById(state, trackId)
      const trimmed = name.trim()
      if (!track || !trimmed) return state
      before = track.name
      return updateTrack(state, trackId, current => ({ ...current, name: trimmed }))
    },
    revert: state =>
      before === null
        ? state
        : updateTrack(state, trackId, current => ({ ...current, name: before ?? current.name })),
  }
}
