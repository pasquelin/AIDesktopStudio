import type { Asset } from '@shared/domain/asset'
import type { TakeBounds, TakeShape } from '@/engines/audio/edits'
import { addClips, editClip } from '@/engines/timeline/commands'
import {
  clipForScene,
  placementsForAsset,
  trackForAsset,
  trackForScene,
} from '@/engines/timeline/insert'
import {
  clampFades,
  clampGain,
  clipById,
  EMPTY_SEQUENCE,
  trackById,
  trackOfClip,
  updateClip,
  updateTrack,
  wholeFrames,
  type Clip,
  selectClip,
  selectTrack,
  type SequenceState,
  type Track,
  type Us,
} from '@/engines/timeline/timelineState'
import { sameValues } from '@/helpers/objects'
import { createDocumentStore } from './documentStore'

/** One sequence per document, in memory like the documents themselves. */
const store = createDocumentStore<SequenceState>(EMPTY_SEQUENCE)

export const sequenceStore = store
export const useSequences = store.use
export const sequenceOf = store.stateOf
export const sequenceHistoryOf = store.historyOf
export const isSequenceDirty = store.isDirty

/**
 * What a montage designates, wherever the gesture came from. Read at CALL time, like `selectIn`
 * and `selectLayerIn`, and outside the history — selecting is not an edit. Answers the state
 * either way, which is what lets a drag keep its baseline.
 */
export function selectClipIn(documentId: string, clipId: string | null): SequenceState {
  return designate(documentId, sequence => selectClip(sequence, clipId))
}

/** Its twin for a row. Silent on a montage whose file is still on its way, as its neighbours are. */
export function selectTrackIn(documentId: string, trackId: string | null): void {
  designate(documentId, sequence => selectTrack(sequence, trackId))
}

function designate(
  documentId: string,
  change: (sequence: SequenceState) => SequenceState,
): SequenceState {
  const current = store.use.getState()
  const sequence = store.stateOf(current, documentId)
  if (!store.hasState(current, documentId)) return sequence

  const next = change(sequence)
  if (
    next.selectedId === sequence.selectedId &&
    next.selectedTrackId === sequence.selectedTrackId
  ) {
    return sequence
  }

  current.replaceView(documentId, next)
  return next
}

/**
 * Whether any track of that montage would hold this asset — what keeps the cascade from
 * settling on a destination that then refuses in silence, and switches workspace to do it.
 */
export function sequenceTakes(documentId: string, asset: Asset): boolean {
  return trackForAsset(store.stateOf(store.use.getState(), documentId), asset) !== null
}

/**
 * Drops an asset onto a montage, at its playhead. Nothing happens when every track refuses it —
 * silence rather than a throw, since this hangs off a double-click that can land anywhere.
 *
 * The document is named by the caller, like every other destination of `ASSET_INTENTS`: reading
 * the tab in front here made this the one destination an asset could not be sent to from
 * somewhere else.
 */
export function addAssetToSequence(documentId: string, asset: Asset): void {
  const current = store.use.getState()
  // The guard its neighbour below carries, and for the same window: `stateOf` answers with the
  // SEQUENCE DEFAULT for a document whose file is still being read, so a drop landing there
  // writes a montage of that default — and the file, arriving after it, has a state to argue
  // with. Silence, like every other refusal of this function.
  if (!store.hasState(current, documentId)) return

  const sequence = store.stateOf(current, documentId)

  const placements = placementsForAsset(sequence, asset, asset.id, sequence.playhead)
  if (placements.length > 0) current.runCommand(documentId, addClips(placements))
}

/**
 * Drops a 3D scene onto a montage as a live clip: what it shows is rendered from the document
 * as the head passes over it, so editing the scene shows up here without anything being written
 * out first.
 *
 * `trackId` is what the pointer landed on; without one the clip goes to the first picture row
 * that would take it. Nothing happens when the montage paints no picture at all — the Audio
 * workspace, where a scene has nothing to be shown on.
 */
export function addSceneToSequence(
  documentId: string,
  sceneId: string,
  duration: Us | null,
  start?: Us,
  trackId?: string,
): void {
  const current = store.use.getState()
  // The same window its neighbours guard against: a montage still being read off disk answers
  // with the default, and a clip laid there argues with the file that arrives after it.
  if (!store.hasState(current, documentId)) return

  const sequence = store.stateOf(current, documentId)
  const aimed = trackId ? trackById(sequence, trackId) : null
  // A scene is a picture: a sound row accepted under the pointer would paint nothing at all.
  const target = aimed?.kind === 'video' && !aimed.locked ? aimed : trackForScene(sequence)
  if (!target) return

  const clip = clipForScene(sceneId, duration, start ?? sequence.playhead, sequence.settings)
  current.runCommand(documentId, addClips([{ trackId: target.id, clip }]))
}

/**
 * Lays a take down, and `addClips` designates what it laid — which is what opens it in the editor.
 *
 * Outside the HISTORY, not merely outside a gesture: loading a take is not something ⌘Z gives
 * back — the editor half drops its chain outright, so one press after a load undid the clip while
 * the chain went on naming it, and every later edit stopped reaching a strip that no longer held it.
 */
export function addTakeToSequence(documentId: string, asset: Asset): void {
  const current = store.use.getState()
  // Nothing rather than the wrong thing, as `SoundPanel` puts it: `stateOf` answers with the
  // SEQUENCE default — a picture track — for a document whose file is still on its way, and a
  // take dropped in that window would build the Audio workspace a row it cannot play.
  if (!store.hasState(current, documentId)) return

  const sequence = store.stateOf(current, documentId)

  const placements = placementsForAsset(sequence, asset, asset.id, sequence.playhead)
  if (placements.length === 0) return

  current.replace(documentId, addClips(placements).apply(sequence))
}

/**
 * A length that stops where the next clip on the track begins.
 *
 * `updateClip` writes in place, with none of the overwrite insertion `insertClip` performs, and
 * a take growing back — a crop undone, a chain emptied by "apply" — would otherwise run over its
 * neighbour. Clips of a track are sorted and never overlap, and every later edit assumes it.
 */
function fits(state: SequenceState, clip: Clip, duration: Us): Us {
  const track = trackOfClip(state, clip.id)
  const next = track?.clips.find(other => other.start > clip.start)
  return next ? Math.min(duration, next.start - clip.start) : duration
}

/**
 * A shape laid onto the clip that carries it — the one place that knows how the editor's
 * arithmetic becomes a clip, read by the two writers below.
 *
 * `start` and `speed` are left alone: where a take sits on the strip and how fast it runs are
 * decisions about the montage, and the editor above knows nothing of either.
 */
function shapedClip(sequence: SequenceState, clip: Clip, shape: TakeShape): Clip {
  // Clamped HERE rather than left to `updateClip`, which clamps on the way in: comparing against
  // the unclamped shape would answer "changed" forever as soon as the two ramps outlast the
  // clip, and every render would repaint the strip. On the frame grid too, exactly as
  // `clipForAsset` lays a clip down: a duration that is not a whole number of frames leaves a
  // tail nothing can snap to.
  return clampFades({
    ...clip,
    inPoint: shape.inPoint,
    // Source time divided by the speed, because a clip's duration is TIMELINE time — the two are
    // the same only at speed 1. `takeSliceOf` multiplies by it going the other way, which is what
    // makes the round trip land on the clip it started from.
    duration: fits(sequence, clip, wholeFrames(shape.duration / clip.speed, sequence.settings)),
    fadeIn: shape.fadeIn,
    fadeOut: shape.fadeOut,
    // Bounded like every other writer of this field. A quiet take normalised to −14 LUFS asks
    // for +26 dB, which `applyGain` absorbs on the samples it clamps and the strip does not:
    // `sound-schedule` would hand the output a twentyfold gain on the raw source.
    gain: clampGain(shape.gain),
  })
}

/**
 * Rewrites the clip a take was laid down as, so that what the strip plays is what the editor
 * plays: the ramps and the level the chain came to.
 *
 * Outside the history, like `writeTrack` below and for a stricter reason than convenience: the
 * chain already owns ⌘Z here, and a second entry per edit would make one press give back half a
 * change — the studio's "two diverging undo stacks", from the other end.
 *
 * The bounds ride along and never move: the chain is replayed FROM them — see `takeSliceOf` —
 * so what this writes back is what it was handed. That is what makes it safe to run on every
 * render, and it is why the chain holds no step that cuts.
 */
export function writeTakeClip(documentId: string, clipId: string, shape: TakeShape): void {
  const current = store.use.getState()
  if (!store.hasState(current, documentId)) return

  const sequence = store.stateOf(current, documentId)
  const clip = clipById(sequence, clipId)
  if (!clip) return

  const shaped = shapedClip(sequence, clip, shape)
  // A render answers on every open of a document, not only on an edit, and writing an unchanged
  // clip would wake every reader of the montage for nothing.
  if (sameValues(clip, shaped)) return

  current.replace(
    documentId,
    updateClip(sequence, clipId, () => shaped),
  )
}

/**
 * Points a block at the file "apply" has just written, and lays it flat: the whole of that file,
 * no ramps, no level. Everything the block described is now IN the bytes, and a block still
 * describing it would have the montage play it twice.
 *
 * ON the history, where `writeTakeClip` above deliberately is not, and for a reason that is not
 * about ⌘Z: which take a block plays is held by the MONTAGE and by nothing else — the chain that
 * asked for it is dropped by the same button. Written outside, the document read as having
 * nothing to save: ⌘W closed the tab without asking, and the block reopened on the original take
 * with the whole edit gone and the file just written orphaned. An entry on the history is what
 * marks a document dirty.
 */
const FLAT_TAKE = { inPoint: 0, fadeIn: 0, fadeOut: 0, gain: 0 }

export function flattenTakeClip(
  documentId: string,
  clipId: string,
  assetId: string,
  duration: Us,
): void {
  store.use.getState().runCommand(
    documentId,
    editClip(`takeFlat:${clipId}`, clipId, (clip, state) =>
      shapedClip(state, { ...clip, assetId }, { ...FLAT_TAKE, duration }),
    ),
  )
}

/**
 * The slice a block shows, set outright from the editor — cropping to a selection, dropping the
 * silence at the two ends.
 *
 * On the history, where its neighbour above deliberately is not, and that is the whole difference
 * between them: this is a montage gesture that happens to be made from the editor, so ⌘Z has to
 * give the block its bounds back. It goes on the SEQUENCE's stack for the same reason — the
 * bounds are the montage's, and `AudioDocument` already arbitrates between the two stacks.
 *
 * The RAMPS AND THE LEVEL are the clip's own and ride through untouched: what a cut leaves of a
 * ramp is `clampFades`' answer, and a hand's gain has nothing to do with where one cut. Written
 * from a slice — where they are zero by construction — a crop wiped both.
 *
 * `trimClip` is the other way to move these bounds and stays what a hand does on the strip: it
 * drags one edge and lets the block grow over its neighbour. This lands both edges at once and
 * never lengthens, a selection being a stretch of what is already there.
 */
export function trimTakeClip(documentId: string, clipId: string, slice: TakeBounds): void {
  store.use.getState().runCommand(
    documentId,
    editClip(`takeSlice:${clipId}`, clipId, (clip, state) =>
      shapedClip(state, clip, {
        ...slice,
        fadeIn: clip.fadeIn,
        fadeOut: clip.fadeOut,
        gain: clip.gain,
      }),
    ),
  )
}

/**
 * Rewrites a track outside the history.
 *
 * Mute, solo, lock and height are how one works, not what one made: they have no business on
 * the undo stack. Written here rather than in each surface — the header column and the
 * inspector both do it, and the rule has to hold in one place.
 */
export function writeTrack(
  documentId: string,
  trackId: string,
  change: (track: Track) => Track,
): void {
  const current = store.use.getState()
  current.replaceView(documentId, updateTrack(store.stateOf(current, documentId), trackId, change))
}
