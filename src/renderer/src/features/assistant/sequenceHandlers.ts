import { refused, type ActionOutcome } from '@shared/domain/assistant'
import { aimedAt, type Target } from '@shared/domain/target'
import type { Command } from '@/engines/core/history'
import {
  addClips,
  addClipsOnNewTracks,
  addTrack,
  mediaExtentOf,
  moveClip,
  moveTrack,
  removeClip,
  removeTrack,
  renameTrack,
  setClipFade,
  setClipGain,
  setClipSpeed,
  splitClip,
  trimClip,
  unlinkClip,
} from '@/engines/timeline/commands'
import { newTracksForAsset, placementsForAsset } from '@/engines/timeline/insert'
import {
  CLIP_EDGES,
  clampTrackHeight,
  clipById,
  clipEnd,
  editableTrack,
  sequenceDuration,
  TRACK_KINDS,
  trackById,
  type Clip,
  type SequenceState,
} from '@/engines/timeline/timelineState'
import { seekTo } from '@/features/video/components/TimelineCanvas/sequenceCommands'
import { activeMontageId, useDocuments } from '@/stores/documents'
import {
  selectClipIn,
  selectTrackIn,
  sequenceOf,
  useSequences,
  writeTrack,
} from '@/stores/sequences'
import { answered, withAsset, withBridge, type ActionHandlers } from './actionHandler'
import { flagNamed, numberOf, oneOf, textOf } from './actionInputs'

/**
 * Clips and tracks, driven by value.
 *
 * Every one of these runs a command of `engines/timeline/commands.ts` — the same ones the strip
 * runs, so an edit made from outside undoes exactly like one made with the mouse. The four dials
 * of `track.setMuteSoloLockHeight` are the exception the header column already makes: they never enter the
 * history.
 */

/** What a caller does about it, spelled once for the eleven sites that answer `wrongSurface`. */
const NO_MONTAGE =
  'the document in front is no montage — documents.list answers what is open and of which kind, ' +
  'and document.activate brings a sequence or an audio montage forward'

/** The montage in front, in either workspace, or nothing — which reads as `wrongSurface`. */
function mounted(): { documentId: string; state: SequenceState } | null {
  const documentId = activeMontageId(useDocuments.getState())
  return documentId === null
    ? null
    : { documentId, state: sequenceOf(useSequences.getState(), documentId) }
}

/** What a caller does about a clip nobody answers to — spelled once for the two sites. */
const noClip = (named: string): string =>
  `no clip "${named}" on this montage — sequence.state answers "tracks", each with the clips on ` +
  'it and their ids'

function stateOf(documentId: string): SequenceState {
  return sequenceOf(useSequences.getState(), documentId)
}

function run(
  documentId: string,
  command: Command<SequenceState>,
  /** What the call answers, read off the montage AFTER the command — see `clipAfter`. */
  answer?: (state: SequenceState) => unknown,
): ActionOutcome {
  useSequences.getState().runCommand(documentId, command)
  return answered(answer, () => sequenceOf(useSequences.getState(), documentId))
}

/** One clip as it now stands, for what a write answers — nothing when the command removed it. */
const clipAfter =
  (clipId: string, read: (clip: Clip) => unknown) =>
  (state: SequenceState): unknown => {
    const clip = clipById(state, clipId)
    return clip ? read(clip) : undefined
  }

/** Where a clip now sits — what a move and a trim answer, since both are clamped on the way. */
const spanOf = (clip: Clip): { start: number; end: number } => ({
  start: clip.start,
  end: clipEnd(clip),
})

/**
 * The same, for one named clip, found before anything runs.
 *
 * The lookup is the point: a command whose clip is gone answers by returning the state untouched,
 * so without it every miss would be reported as done.
 */
function editClipOf(
  input: Record<string, unknown>,
  build: (clip: Clip, state: SequenceState) => Command<SequenceState> | null,
  /** What a caller does when the clip IS there and the build still declines. */
  nothing: string,
  answer?: (clip: Clip) => unknown,
): ActionOutcome {
  const open = mounted()
  if (!open) return refused('wrongSurface', NO_MONTAGE)

  const named = textOf(input, 'clipId') ?? ''
  const clip = clipById(open.state, named)
  if (!clip) return refused('notFound', noClip(named))

  const command = build(clip, open.state)
  if (!command) return refused('badInput', nothing)

  return run(open.documentId, command, answer && clipAfter(clip.id, answer))
}

/** The same for a track, and only one an edit may reach: a locked row refuses in silence. */
function editTrackOf(
  input: Record<string, unknown>,
  build: (trackId: string, state: SequenceState) => Command<SequenceState> | null,
  /** What a caller does when the row IS reachable and the build still declines. */
  nothing: string,
): ActionOutcome {
  const open = mounted()
  if (!open) return refused('wrongSurface', NO_MONTAGE)

  const track = editableTrack(open.state, textOf(input, 'trackId') ?? '')
  if (!track)
    return refused(
      'badInput',
      `"trackId" must name a row of this montage that is not locked — sequence.state answers "tracks" with their ids and their "locked"`,
    )

  const command = build(track.id, open.state)
  return command ? run(open.documentId, command) : refused('badInput', nothing)
}

const clipIdsOf = (state: SequenceState): string[] =>
  state.tracks.flatMap(track => track.clips.map(clip => clip.id))

function readState(): ActionOutcome {
  const open = mounted()
  if (!open) return refused('wrongSurface', NO_MONTAGE)

  return {
    ok: true,
    data: {
      documentId: open.documentId,
      settings: open.state.settings,
      playhead: open.state.playhead,
      selectedId: open.state.selectedId,
      selectedTrackId: open.state.selectedTrackId,
      duration: sequenceDuration(open.state),
      /**
       * 🛑 A value AT ITS DEFAULT is left out, and absent reads as that default — a row is not
       * muted, a clip runs at speed 1 with no fade and no gain. `resultLine` cuts by whole
       * members, and `tracks` is the only one carrying a clip id, a start or a duration: a
       * montage of two clips ran to 981 characters and came back `(cut short: tracks)`, so the
       * model could not see one clip of the edit it was working on — measured 2026-09-01.
       */
      tracks: open.state.tracks.map(track => ({
        id: track.id,
        kind: track.kind,
        // The name only where it says something the id does not — a row is called `V1` by both.
        ...(track.name === track.id ? {} : { name: track.name }),
        index: track.index,
        ...(track.muted ? { muted: true } : {}),
        ...(track.solo ? { solo: true } : {}),
        ...(track.locked ? { locked: true } : {}),
        clips: track.clips.map(clip => ({
          id: clip.id,
          assetId: clip.assetId,
          ...(clip.sceneId === undefined ? {} : { sceneId: clip.sceneId }),
          start: clip.start,
          duration: clip.duration,
          // Kept though it is start + duration: « juste après le premier » is answered from it,
          // and a model that has to add two microsecond counts gets it wrong.
          end: clipEnd(clip),
          ...(clip.inPoint === 0 ? {} : { inPoint: clip.inPoint }),
          ...(clip.speed === 1 ? {} : { speed: clip.speed }),
          ...(clip.fadeIn === 0 ? {} : { fadeIn: clip.fadeIn }),
          ...(clip.fadeOut === 0 ? {} : { fadeOut: clip.fadeOut }),
          ...(clip.gain === 0 ? {} : { gain: clip.gain }),
          ...(clip.linkId === undefined ? {} : { linkId: clip.linkId }),
        })),
      })),
    },
  }
}

/**
 * Lays an asset down, opening the rows it needs when the montage has none — which is what a drop
 * on an empty timeline does.
 *
 * The clips are answered by comparing the montage before and after, and that is also what tells a
 * refusal from a placement: a rush over a sound montage opens no row and adds no clip, and
 * `addClipsOnNewTracks` says so by handing the state back untouched.
 */
function addClip(input: Record<string, unknown>): Promise<ActionOutcome> {
  const open = mounted()
  if (!open) return Promise.resolve(refused('wrongSurface', NO_MONTAGE))

  const assetId = textOf(input, 'assetId') ?? ''
  return withAsset(assetId, asset => {
    const start = numberOf(input, 'start') ?? open.state.playhead
    const placements = placementsForAsset(
      open.state,
      asset,
      assetId,
      start,
      textOf(input, 'trackId') ?? undefined,
    )

    if (placements.length === 0 && newTracksForAsset(open.state, asset).length === 0) {
      return refused(
        'badInput',
        `no row of this montage holds a "${asset.type}", and none can be opened for one — sequence.state answers "tracks" with their "kind"`,
      )
    }

    const before = new Set(clipIdsOf(open.state))
    run(
      open.documentId,
      placements.length > 0 ? addClips(placements) : addClipsOnNewTracks(asset, assetId, start),
    )

    const laid = clipIdsOf(stateOf(open.documentId)).filter(id => !before.has(id))
    return laid.length === 0
      ? refused(
          'badInput',
          `the montage took no clip from asset "${assetId}" — the row named may be locked, or hold nothing of that kind`,
        )
      : { ok: true, data: { clipIds: laid } }
  })
}

/** A trim stops where the media does, and only the catalogue knows how far that is. */
async function trim(input: Record<string, unknown>): Promise<ActionOutcome> {
  const open = mounted()
  if (!open) return refused('wrongSurface', NO_MONTAGE)

  const clip = clipById(open.state, textOf(input, 'clipId') ?? '')
  const edge = oneOf(input, 'edge', CLIP_EDGES)
  const at = numberOf(input, 'at')
  if (!clip || !edge || at === null)
    return refused(
      'badInput',
      `"clipId" must name a clip of this montage — sequence.state answers "tracks" with the clips on them — "edge" one of: ${CLIP_EDGES.join(', ')}, and "at" the instant to trim to`,
    )

  // A live scene clip carries no catalogue row at all, and `mediaExtentOf` answers `unknown` for
  // it — the same thing the strip reads under the pointer.
  const found = await withBridge(bridge =>
    clip.assetId === ''
      ? Promise.resolve([])
      : bridge.assets.search({ ids: [clip.assetId], limit: 1 }),
  )
  if (!found.ok) return found

  const asset = Array.isArray(found.data) ? (found.data[0] ?? null) : null
  return run(
    open.documentId,
    trimClip(clip.id, edge, at, mediaExtentOf(asset)),
    clipAfter(clip.id, spanOf),
  )
}

function seek(input: Record<string, unknown>): ActionOutcome {
  const open = mounted()
  if (!open) return refused('wrongSurface', NO_MONTAGE)

  const time = numberOf(input, 'time')
  if (time === null)
    return refused(
      'badInput',
      '"time" is wanted — where to stand the playhead, as sequence.state reports "playhead" and "duration"',
    )

  // Not a command: where the head sits is how one looks at a montage, not an edit of it — the
  // strip writes it the same way.
  seekTo(open.documentId, time)
  return { ok: true }
}

function select(input: Record<string, unknown>): ActionOutcome {
  const open = mounted()
  if (!open) return refused('wrongSurface', NO_MONTAGE)

  const named = textOf(input, 'clipId') ?? ''
  const clip = clipById(open.state, named)
  if (!clip) return refused('notFound', noClip(named))

  selectClipIn(open.documentId, clip.id)
  return { ok: true }
}

function adjustTrack(input: Record<string, unknown>): ActionOutcome {
  const open = mounted()
  if (!open) return refused('wrongSurface', NO_MONTAGE)

  const track = aimedAt(
    open.state.tracks,
    id => trackById(open.state, id),
    textOf(input, 'trackId'),
  )
  if (!track)
    return refused(
      'notFound',
      `no row "${textOf(input, 'trackId') ?? ''}" on this montage, by id or name — sequence.state answers "tracks" with their ids and names`,
    )

  const height = numberOf(input, 'height')
  writeTrack(open.documentId, track.id, current => ({
    ...current,
    ...flagNamed(input, 'muted'),
    ...flagNamed(input, 'solo'),
    ...flagNamed(input, 'locked'),
    ...(height === null ? {} : { height: clampTrackHeight(height) }),
  }))
  return { ok: true }
}

export const SEQUENCE_HANDLERS: ActionHandlers = {
  'sequence.state': readState,
  'sequence.seek': seek,
  'clip.add': addClip,
  'clip.trim': trim,
  'clip.select': select,
  'track.setMuteSoloLockHeight': adjustTrack,

  'clip.remove': input =>
    editClipOf(input, clip => removeClip(clip.id), 'that clip built no removal'),
  'clip.unlink': input =>
    editClipOf(input, clip => unlinkClip(clip.id), 'that clip built no unlink'),

  'clip.move': input => {
    const start = numberOf(input, 'start')
    const trackId = textOf(input, 'trackId')
    return editClipOf(
      input,
      (clip, state) =>
        // A row that is gone, or locked, takes nothing: `moveClip` hands the state back.
        start === null || !trackId || !editableTrack(state, trackId)
          ? null
          : moveClip(clip.id, trackId, start),
      '"start" and "trackId" are both wanted, and "trackId" must name a row of this montage that is not locked — sequence.state answers "tracks" with their ids and their "locked"',
      spanOf,
    )
  },

  'clip.split': input => {
    const at = numberOf(input, 'at')
    return editClipOf(
      input,
      clip =>
        // Outside the clip there is nothing to cut, and the command says so by changing nothing.
        at === null || at <= clip.start || at >= clipEnd(clip) ? null : splitClip(clip.id, at),
      '"at" must fall strictly inside the clip — sequence.state answers each clip\'s "start" and "end"',
    )
  },

  'clip.fade': input => {
    const edge = oneOf(input, 'edge', CLIP_EDGES)
    const length = numberOf(input, 'length')
    return editClipOf(
      input,
      clip => (edge && length !== null ? setClipFade(clip.id, edge, length) : null),
      `"edge" and "length" are both wanted, and "edge" is one of: ${CLIP_EDGES.join(', ')}`,
      clip => (edge === 'in' ? { fadeIn: clip.fadeIn } : { fadeOut: clip.fadeOut }),
    )
  },

  'clip.gain': input => {
    const gain = numberOf(input, 'gain')
    return editClipOf(
      input,
      clip => (gain === null ? null : setClipGain(clip.id, gain)),
      '"gain" is wanted, as a number',
      clip => ({ gain: clip.gain }),
    )
  },

  'clip.speed': input => {
    const speed = numberOf(input, 'speed')
    return editClipOf(
      input,
      clip => (speed === null ? null : setClipSpeed(clip.id, speed)),
      '"speed" is wanted, as a number — 1 plays at the take\'s own rate',
    )
  },

  'track.add': input => {
    const open = mounted()
    if (!open) return refused('wrongSurface', NO_MONTAGE)

    const kind = oneOf(input, 'kind', TRACK_KINDS)
    return kind
      ? run(open.documentId, addTrack(kind))
      : refused('badInput', `"kind" wants one of: ${TRACK_KINDS.join(', ')}`)
  },

  'track.remove': input =>
    editTrackOf(input, trackId => removeTrack(trackId), 'that row built no removal'),

  'track.reorderTracks': input => {
    const by = numberOf(input, 'by')
    return editTrackOf(
      input,
      trackId => (by === null ? null : moveTrack(trackId, by)),
      '"by" is wanted — how many rows to move, negative to go up',
    )
  },

  'track.rename': input => {
    const name = textOf(input, 'name')
    return editTrackOf(
      input,
      trackId => (name === null ? null : renameTrack(trackId, name)),
      '"name" is wanted — the new name of the row',
    )
  },
}

/**
 * What a sentence may aim at inside a montage: the rows, and the clips on them.
 *
 * 🛑 Rows as well as clips, and the rows are why this exists: `clip.move` REQUIRES a track id,
 * and a briefing naming none had a model guess `track-1`, `track-2` and the empty string, eight
 * refusals in a row on one sentence. A clip stands under its own id, as `selectionNow` says.
 */
export function montageTargets(): readonly Target[] {
  const open = mounted()
  if (!open) return []

  return open.state.tracks.flatMap((track): Target[] => [
    {
      id: track.id,
      kind: 'track',
      name: track.name,
      selected: track.id === open.state.selectedTrackId,
    },
    ...track.clips.map((clip): Target => ({
      id: clip.id,
      kind: 'clip',
      name: clip.id,
      selected: clip.id === open.state.selectedId,
    })),
  ])
}

/** Aiming at either, through the doors the strip itself presses. */
export function selectInMontage(id: string): ActionOutcome {
  const open = mounted()
  if (!open) return refused('wrongSurface', NO_MONTAGE)

  const track = aimedAt(open.state.tracks, one => trackById(open.state, one), id)
  if (track) {
    selectTrackIn(open.documentId, track.id)
    return { ok: true }
  }
  if (!clipById(open.state, id))
    return refused(
      'notFound',
      `nothing on this montage answers to "${id}", by id or name — sequence.state answers "tracks" and the clips on them`,
    )

  selectClipIn(open.documentId, id)
  return { ok: true }
}
