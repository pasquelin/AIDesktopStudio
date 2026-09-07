import { isTimeless, mediaDuration, type Asset } from '@shared/domain/asset'
import { composed, type Command } from '../core/history'
import { clipForAsset, newTracksForAsset, pairedPlacements, type ClipPlacement } from './insert'
import {
  clampFades,
  clampGain,
  clampSpeed,
  clipById,
  clipEnd,
  clipFrom,
  editableTrack,
  insertClip,
  linkedClipIds,
  newClipId,
  selectClip,
  snapToFrame,
  trackOfClip,
  updateClip,
  updateTrack,
  type Clip,
  type ClipEdge,
  type SequenceSelection,
  type SequenceState,
  type Us,
} from './timelineState'
import { addTrack } from './trackCommands'
import { acrossLink, selectionOf, withoutClip } from './linkedCommand'
export { addTrack, moveTrack, removeTrack, renameTrack } from './trackCommands'

/**
 * Sequence edits, on the pattern of `engines/scene/commands.ts`: a command captures what it
 * needs to revert **as it is applied**, not as it is built — what a track looked like before is
 * only known once the edit runs. Redo re-applies and re-captures.
 */

/**
 * What is known of the media behind a clip, which is not the same question as how long it runs.
 * `mediaDuration` answers null for a still AND for an asset nobody has probed yet — deliberately,
 * since both are timeless when a clip is first laid down. A trim has to tell them apart: a still
 * has no source to run past, an unprobed video has one whose length is simply not known yet.
 */
export type MediaExtent = Us | 'still' | 'unknown'

/**
 * The extent of the media behind a clip, read from its catalogue row. Only the catalogue knows how
 * far a source runs, and every surface that trims has to ask it the same way.
 */
export function mediaExtentOf(asset: Asset | null): MediaExtent {
  return mediaDuration(asset) ?? (isTimeless(asset) ? 'still' : 'unknown')
}

/**
 * How far a trim may travel before it would run past the media behind it. There is nothing to
 * show before a source starts or after it ends, and a clip stretched there freezes on a frame
 * while its sound goes silent.
 *
 * A still has nothing to run past on either edge, so both of its edges stretch it and the only
 * bound left is the start of the sequence. That is what makes a title card: put an image down,
 * pull either end, decide how long it stays up.
 */
function boundToMedia(clip: Clip, edge: ClipEdge, at: Us, media: MediaExtent): Us {
  const headroom = (source: Us): Us => Math.round(source / clip.speed)

  // The sequence start is the only bound a still has left, and `snapToFrame` already holds it.
  if (media === 'still') return edge === 'in' ? Math.max(at, 0) : at

  // An unknown length still bounds the in point: the source starts somewhere, whoever knows when.
  if (edge === 'in') return Math.max(at, clip.start - headroom(clip.inPoint))
  return media === 'unknown' ? at : Math.min(at, clip.start + headroom(media - clip.inPoint))
}

/**
 * Puts a track's clips back exactly as they were.
 *
 * Insertion overwrites — it trims, splits and drops whatever the newcomer covers — so undoing
 * it by removing that one clip again leaves the neighbours it ate still eaten. Restoring the
 * whole list is the only way back to the state the user pressed undo from.
 */
const restore = (state: SequenceState, trackId: string, clips: Clip[]): SequenceState =>
  updateTrack(state, trackId, current => ({ ...current, clips }))

/**
 * Lays down what one asset became — one clip, or the picture and the sound of a take, which
 * must be ONE history entry: undoing a drop that put down two clips has to take back both.
 *
 * The picture is what ends up selected, whatever order the parts ran in: it is the half the
 * user aimed at, and the inspector reads the selection.
 */
export function addClips(placements: readonly ClipPlacement[]): Command<SequenceState> {
  const aimed = placements[0]?.clip.id ?? null
  const all = composed(
    `add:${aimed}`,
    placements.map(({ trackId, clip }) => addClip(trackId, clip)),
  )

  return { ...all, apply: state => selectClip(all.apply(state), aimed) }
}

/**
 * Lays an asset down on rows opened for it — what a drop into the empty space below the last
 * track comes to, and what makes that space usable instead of inert.
 *
 * ONE history entry, rows included: ⌘Z after a drop that opened two tracks has to take back both
 * the clips and the rows, or the montage grows a pair of empty tracks every time one is undone.
 *
 * Composed on the first apply and KEPT, exactly as `acrossLink` is, and for a sharper reason:
 * `addTrack` decides its own name as it runs, and the clips are laid on the names it chose.
 * Rebuilding the parts on redo would name rows that undo had already taken away.
 */
export function addClipsOnNewTracks(
  asset: Asset | null,
  assetId: string,
  start: Us,
): Command<SequenceState> {
  let parts: Command<SequenceState>[] | null = null

  return {
    id: `add:tracks:${assetId}`,
    apply: state => {
      if (parts) return parts.reduce((current, part) => part.apply(current), state)

      const kinds = newTracksForAsset(state, asset)
      // Nothing this montage would open a row for — a rush over a sound montage. Handed back
      // untouched, which is how every command here refuses.
      if (kinds.length === 0) return state

      const adds = kinds.map(addTrack)
      const opened = adds.reduce((current, add) => add.apply(current), state)
      // The rows just opened, in the order they were asked for: `addTrack` appends at the bottom
      // and names itself as it runs, so reading them off the tail is the only way to their ids.
      const [target, sound] = opened.tracks.slice(-kinds.length)
      if (!target) return state

      const laid = addClips(
        pairedPlacements(
          clipForAsset(assetId, asset, start, state.settings),
          target.id,
          sound?.id ?? null,
        ),
      )
      parts = [...adds, laid]
      return laid.apply(opened)
    },
    revert: state =>
      parts ? parts.reduceRight((current, part) => part.revert(current), state) : state,
  }
}

export function addClip(trackId: string, clip: Clip): Command<SequenceState> {
  let before: { clips: Clip[]; selection: SequenceSelection } | null = null
  const tailId = newClipId()

  return {
    id: `add:${clip.id}`,
    apply: state => {
      const track = editableTrack(state, trackId)
      if (!track) return state

      before = { clips: track.clips, selection: selectionOf(state) }
      return selectClip(
        updateTrack(state, trackId, current => insertClip(current, clip, tailId)),
        clip.id,
      )
    },
    revert: state => {
      const origin = before
      if (!origin) return state
      return { ...restore(state, trackId, origin.clips), ...origin.selection }
    },
  }
}

/**
 * Drags a clip, and with it whatever is tied to it.
 *
 * A twin follows in time and stays on its own track: the sound of a take dragged from V1 to V2
 * has nowhere to go if the sequence holds one audio track, and a sound moved to a picture track
 * would be painted rather than heard.
 */
export function moveClip(clipId: string, toTrackId: string, start: Us): Command<SequenceState> {
  return acrossLink(`move:${clipId}`, clipId, (state, linkedId) => {
    if (linkedId === clipId) return moveOneClip(clipId, toTrackId, start)

    const twin = clipById(state, linkedId)
    const dragged = clipById(state, clipId)
    const track = trackOfClip(state, linkedId)
    if (!twin || !dragged || !track) return null

    return moveOneClip(linkedId, track.id, twin.start + (start - dragged.start))
  })
}

function moveOneClip(clipId: string, toTrackId: string, start: Us): Command<SequenceState> {
  let from: {
    trackId: string
    sourceClips: Clip[]
    targetClips: Clip[]
    selection: SequenceSelection
  } | null = null
  const tailId = newClipId()

  return {
    id: `move:${clipId}`,
    apply: state => {
      const source = trackOfClip(state, clipId)
      const clip = clipById(state, clipId)
      const target = editableTrack(state, toTrackId)
      if (!source || source.locked || !clip || !target) return state

      from = {
        trackId: source.id,
        sourceClips: source.clips,
        targetClips: target.clips,
        selection: selectionOf(state),
      }

      const moved: Clip = { ...clip, start: snapToFrame(start, state.settings) }
      const lifted = updateTrack(state, source.id, current => withoutClip(current, clipId))
      return selectClip(
        updateTrack(lifted, toTrackId, current => insertClip(current, moved, tailId)),
        clipId,
      )
    },
    revert: state => {
      const origin = from
      if (!origin) return state

      // The target first: moving within one track makes both of these the same track, and the
      // source is the list that was there before anything moved.
      const restored = restore(state, toTrackId, origin.targetClips)
      return { ...restore(restored, origin.trackId, origin.sourceClips), ...origin.selection }
    },
  }
}

/**
 * Drags one edge of a clip. `media` says what is known of the source behind it — see
 * `MediaExtent`; the command reads the sequence, and the catalogue is not part of it.
 *
 * A trim grows over its neighbour rather than stopping at it, the way DaVinci and Premiere do it
 * on their default tool: an editor lengthening a shot means the shot after it to give way.
 */
export function trimClip(
  clipId: string,
  edge: ClipEdge,
  at: Us,
  media: MediaExtent,
): Command<SequenceState> {
  // The same instant on both halves, and the same media behind them: a twin is the same asset,
  // so what bounds one bounds the other.
  return acrossLink(`trim:${clipId}:${edge}`, clipId, (_, linkedId) =>
    trimOneClip(linkedId, edge, at, media),
  )
}

function trimOneClip(
  clipId: string,
  edge: ClipEdge,
  at: Us,
  media: MediaExtent,
): Command<SequenceState> {
  let before: { clips: Clip[]; trackId: string } | null = null
  // Minted once with the command: a trim landing mid-neighbour cuts a tail loose, and a redo
  // must not rename it.
  const tailId = newClipId()

  return {
    id: `trim:${clipId}:${edge}`,
    apply: state => {
      const track = trackOfClip(state, clipId)
      const clip = clipById(state, clipId)
      if (!track || track.locked || !clip) return state

      const time = boundToMedia(clip, edge, snapToFrame(at, state.settings), media)
      const trimmed =
        edge === 'out' ? { ...clip, duration: time - clip.start } : clipFrom(clip, time)

      // Refused rather than clamped: a zero-length clip is not a shorter clip, it is a bug.
      if (trimmed.duration <= 0) return state

      before = { clips: track.clips, trackId: track.id }
      // Through the insertion, which is what keeps the track sorted and free of overlap when a
      // grown clip covers the one next to it — trimmed, split or dropped, as a drop would.
      return updateTrack(state, track.id, current =>
        insertClip(withoutClip(current, clipId), clampFades(trimmed), tailId),
      )
    },
    revert: state => {
      if (!before) return state
      return restore(state, before.trackId, before.clips)
    },
  }
}

export function splitClip(clipId: string, at: Us): Command<SequenceState> {
  // One link for both tails, minted once: the two halves of a cut take stay tied to each other
  // and to nothing else, or dragging one head would drag the far side of the cut with it.
  const tailLink = newClipId()
  return acrossLink(`split:${clipId}`, clipId, (_, linkedId) =>
    splitOneClip(linkedId, at, tailLink),
  )
}

function splitOneClip(clipId: string, at: Us, tailLink: string): Command<SequenceState> {
  let before: { clip: Clip; trackId: string } | null = null
  // Minted once with the command, not on each apply: a redo must not rename the tail.
  const tailId = newClipId()

  return {
    id: `split:${clipId}`,
    apply: state => {
      const track = trackOfClip(state, clipId)
      const clip = clipById(state, clipId)
      if (!track || track.locked || !clip) return state

      const time = snapToFrame(at, state.settings)
      if (time <= clip.start || time >= clipEnd(clip)) return state

      before = { clip, trackId: track.id }

      // The cut point gets no ramp: a split is a butt joint, and fading into it would dip the
      // level in the middle of what the ear still hears as one take.
      const head: Clip = clampFades({ ...clip, duration: time - clip.start, fadeOut: 0 })
      const tail: Clip = clampFades({
        ...clipFrom(clip, time),
        id: tailId,
        fadeIn: 0,
        // A link the head keeps, so the tail needs one of its own — shared with the tail of
        // whatever was cut alongside it.
        ...(clip.linkId ? { linkId: tailLink } : {}),
      })

      return updateTrack(state, track.id, current => ({
        ...current,
        clips: current.clips.flatMap(candidate =>
          candidate.id === clipId ? [head, tail] : [candidate],
        ),
      }))
    },
    revert: state => {
      if (!before) return state
      const origin = before
      return updateTrack(state, origin.trackId, current => ({
        ...current,
        clips: current.clips
          .filter(candidate => candidate.id !== tailId)
          .map(candidate => (candidate.id === origin.clip.id ? origin.clip : candidate)),
      }))
    },
  }
}

/**
 * One clip rewritten in place, reverted by putting back what was there. Every property edit —
 * fade, gain, speed, the slice the audio editor cuts to — is this command with a different
 * change, so none of them re-derives how to find a clip, refuse a locked track or restore the
 * original.
 *
 * `change` is handed the sequence as well as the clip: a slice has to land on the frame grid and
 * stop at the next clip, and both are read off the montage rather than off the clip alone.
 */
export function editClip(
  id: string,
  clipId: string,
  change: (clip: Clip, state: SequenceState) => Clip,
): Command<SequenceState> {
  let before: Clip | null = null

  return {
    id,
    apply: state => {
      const track = trackOfClip(state, clipId)
      const clip = clipById(state, clipId)
      if (!track || track.locked || !clip) return state

      before = clip
      return updateClip(state, clipId, current => change(current, state))
    },
    revert: state => {
      const origin = before
      return origin ? updateClip(state, clipId, () => origin) : state
    },
  }
}

export function setClipFade(clipId: string, edge: ClipEdge, length: Us): Command<SequenceState> {
  const ramp = Math.max(0, Math.round(length))
  return editClip(`fade:${clipId}:${edge}`, clipId, clip =>
    edge === 'in' ? { ...clip, fadeIn: ramp } : { ...clip, fadeOut: ramp },
  )
}

export function setClipGain(clipId: string, gain: number): Command<SequenceState> {
  return editClip(`gain:${clipId}`, clipId, clip => ({ ...clip, gain: clampGain(gain) }))
}

/**
 * Runs a clip faster or slower — and its twin with it, which is the whole point of the link.
 *
 * `speed` is read on both sides of the montage: `sourceTimeAt` seeks the picture with it and
 * `SoundCue.rate` resamples the sound with it. Changed on one half alone, the two drift apart
 * for good — the one failure a link exists to prevent. A fade and a gain, by contrast, are each
 * half's own business: a sound fades where a picture does not, and a picture has no level.
 */
export function setClipSpeed(clipId: string, speed: number): Command<SequenceState> {
  return acrossLink(`speed:${clipId}`, clipId, (_, linkedId) =>
    editClip(`speed:${linkedId}`, linkedId, clip => ({ ...clip, speed: clampSpeed(speed) })),
  )
}

/**
 * Unties a take's picture from its sound, so each half can be trimmed, moved or deleted alone.
 *
 * The whole group at once, not the clip it was asked on: a link with one member left is a clip
 * that still refuses nothing but looks tied, which is the worst of both.
 */
export function unlinkClip(clipId: string): Command<SequenceState> {
  let untied: { ids: string[]; linkId: string } | null = null

  const relink = (state: SequenceState, ids: readonly string[], linkId?: string): SequenceState =>
    ids.reduce(
      (current, id) =>
        updateClip(current, id, clip => {
          // Deleted off a copy rather than left as `undefined`: a clip written to disk with the
          // key still on it reads back as linked to nothing, and `linkedClipIds` would tie
          // together every clip a file was saved without one.
          const alone = { ...clip }
          delete alone.linkId
          return linkId ? { ...alone, linkId } : alone
        }),
      state,
    )

  return {
    id: `unlink:${clipId}`,
    apply: state => {
      const linkId = clipById(state, clipId)?.linkId
      if (!linkId) return state

      untied = { ids: linkedClipIds(state, clipId), linkId }
      return relink(state, untied.ids)
    },
    revert: state => (untied ? relink(state, untied.ids, untied.linkId) : state),
  }
}

/**
 * Takes a clip away, and with it whatever is tied to it: a take whose picture is deleted and
 * whose sound stays behind is the state an editor never means to be in — unlink first, then
 * delete the half that is in the way.
 */
export function removeClip(clipId: string): Command<SequenceState> {
  return acrossLink(`remove:${clipId}`, clipId, (_, linkedId) => removeOneClip(linkedId))
}

function removeOneClip(clipId: string): Command<SequenceState> {
  let removed: { clip: Clip; trackId: string; index: number; selection: SequenceSelection } | null =
    null

  return {
    id: `remove:${clipId}`,
    apply: state => {
      const track = trackOfClip(state, clipId)
      if (!track || track.locked) return state

      const index = track.clips.findIndex(clip => clip.id === clipId)
      const clip = track.clips[index]
      if (!clip) return state

      removed = { clip, trackId: track.id, index, selection: selectionOf(state) }
      return {
        ...updateTrack(state, track.id, current => withoutClip(current, clipId)),
        selectedId: state.selectedId === clipId ? null : state.selectedId,
      }
    },
    revert: state => {
      if (!removed) return state
      const origin = removed
      return {
        ...updateTrack(state, origin.trackId, current => {
          const clips = [...current.clips]
          // Back at its original index: re-appending would reorder a track the eye reads by order.
          clips.splice(origin.index, 0, origin.clip)
          return { ...current, clips }
        }),
        ...origin.selection,
      }
    },
  }
}
