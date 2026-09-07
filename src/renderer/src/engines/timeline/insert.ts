import { hasSound, mediaDuration, type Asset, type AssetType } from '@shared/domain/asset'
import { newId } from '@/helpers/ids'
import {
  hasTrackOfKind,
  makeClip,
  playsThrough,
  snapToFrame,
  trackById,
  wholeFrames,
  type Clip,
  type SequenceSettings,
  type SequenceState,
  type Track,
  type TrackKind,
  type Us,
} from './timelineState'

/** What a media with no length of its own is worth on the strip — a still, or an unprobed asset. */
export const TIMELESS_DURATION: Us = 5_000_000

/**
 * The clip an asset becomes. Shared by the drop on the strip and by the shelf's own add
 * action: two ways in that must agree on the length, the grid and the defaults.
 */
export function clipForAsset(
  assetId: string,
  asset: Asset | null,
  start: Us,
  settings: SequenceSettings,
): Clip {
  return makeClip({
    id: newId(),
    assetId,
    start: snapToFrame(start, settings),
    // A whole number of frames, so the clip's tail stays snappable — see `wholeFrames`.
    duration: wholeFrames(mediaDuration(asset) ?? TIMELESS_DURATION, settings),
  })
}

/**
 * The clip a scene document becomes. It carries no asset at all: what it draws is rendered from
 * the document as the head passes over it, so there is no catalogue row to point at.
 *
 * The length is the scene's own animation, which is what the person building it decided the shot
 * lasts. A scene with no animation yet falls back to the same five seconds a still gets.
 */
export function clipForScene(
  sceneId: string,
  duration: Us | null,
  start: Us,
  settings: SequenceSettings,
): Clip {
  return makeClip({
    id: newId(),
    assetId: '',
    sceneId,
    start: snapToFrame(start, settings),
    duration: wholeFrames(duration && duration > 0 ? duration : TIMELESS_DURATION, settings),
  })
}

/**
 * Where a scene clip lands: a picture row, and never a sound one — a scene has no soundtrack of
 * its own. Null when the montage paints no picture at all, exactly as an asset drop answers.
 */
export function trackForScene(state: SequenceState): Track | null {
  return landingTrack(state, 'video')
}

/** Which kind of track an asset belongs on. A sound is the only one that is not a picture. */
function kindForAsset(asset: Asset | null): TrackKind {
  return kindForType(asset?.type ?? null)
}

/**
 * The same question asked of a TYPE, which is all a drag announces before it lands — and so the
 * only form a surface can answer in time to say whether it takes the drop.
 */
export function kindForType(type: AssetType | null): TrackKind {
  return type === 'audio' ? 'audio' : 'video'
}

/**
 * Whether a drop would be seen or heard on this track. Locked and silenced alike are skipped —
 * landing on either looks exactly like an add that did nothing.
 */
function takes(state: SequenceState, track: Track, kind: TrackKind): boolean {
  return track.kind === kind && !track.locked && playsThrough(state, track)
}

export function trackTakesType(state: SequenceState, trackId: string, type: AssetType): boolean {
  const track = trackById(state, trackId)
  return track !== null && takes(state, track, kindForType(type))
}

/** The first track of a kind that would take the drop. */
function landingTrack(state: SequenceState, kind: TrackKind): Track | null {
  return state.tracks.find(track => takes(state, track, kind)) ?? null
}

/**
 * Where an asset lands when nobody pointed at a track: sound on a sound track, everything else
 * on a picture track. Locked and silenced tracks are skipped — dropping onto one would look
 * like the add did nothing.
 *
 * Null rather than any track at all when the sequence holds none of that kind: a sound laid on
 * a picture track is painted by the monitor and heard by nobody, which is worse than a refusal.
 */
export function trackForAsset(state: SequenceState, asset: Asset | null): Track | null {
  return landingTrack(state, kindForAsset(asset))
}

/**
 * Whether a montage opens a row of this kind for a drop that landed under its last one.
 *
 * A picture row only where the montage already paints one: the Audio workspace opens on sound
 * tracks alone so that a rush dropped there lands nowhere rather than being montaged into a
 * space with no monitor to show it (`EMPTY_SOUND_SEQUENCE`), and opening one on demand would go
 * behind that decision. A sound is welcome in either — every montage plays one.
 */
function opensKind(state: SequenceState, kind: TrackKind): boolean {
  return kind === 'audio' || hasTrackOfKind(state, 'video')
}

/**
 * The same question asked of what a DRAG announces, which is a type and nothing else — and so
 * the only form the strip can answer while the pointer is still moving, to say whether it takes
 * the drop or leaves the shell to answer it.
 *
 * `null` is a drag that announced no kind, and reads as yes for the reason `draggedAssetType`
 * gives: a drop that silently does nothing is worse than one that lands somewhere sensible.
 */
export function opensTrackFor(state: SequenceState, type: AssetType | null): boolean {
  return type === null || opensKind(state, kindForType(type))
}

/**
 * The rows a drop into the empty space below the montage opens — a picture row, and a sound row
 * beside it for a take that carries one. Empty when the montage would open none.
 *
 * New rows rather than the first free one, which is what the gesture means: what was aimed at is
 * the space UNDER the last track, not "wherever there is room". Dropping on a track still lands
 * on that track, and `placementsForAsset` still fills whatever is free.
 */
export function newTracksForAsset(state: SequenceState, asset: Asset | null): TrackKind[] {
  const kind = kindForAsset(asset)
  if (!opensKind(state, kind)) return []
  return kind === 'video' && hasSound(asset) ? ['video', 'audio'] : [kind]
}

/** One clip and the track it goes on. A take that carries a sound yields two of these. */
export type ClipPlacement = { trackId: string; clip: Clip }

/**
 * One clip, or the linked pair of a take that carries a sound, on rows already chosen — which is
 * the half the two callers share: one picks the rows out of the montage, the other opens them.
 *
 * The `linkId` is what keeps the pair together for good: no later edit can drift the picture
 * against its own sound.
 */
export function pairedPlacements(
  clip: Clip,
  trackId: string,
  soundTrackId: string | null,
): ClipPlacement[] {
  if (!soundTrackId) return [{ trackId, clip }]

  const linkId = newId()
  return [
    { trackId, clip: { ...clip, linkId } },
    { trackId: soundTrackId, clip: { ...clip, id: newId(), linkId } },
  ]
}

/**
 * What laying an asset down comes to: one clip, or the two of a take that carries a sound —
 * the picture on the track that was aimed at, the sound on the first audio track, both tied by
 * a `linkId` so that no later edit can drift one against the other.
 *
 * `trackId` is what the pointer landed on, and it is honoured only when its kind matches the
 * asset: a rush dropped on a sound track otherwise laid a picture where nothing paints it.
 */
export function placementsForAsset(
  state: SequenceState,
  asset: Asset | null,
  assetId: string,
  start: Us,
  trackId?: string,
): ClipPlacement[] {
  const kind = kindForAsset(asset)
  const aimed = trackId ? trackById(state, trackId) : null
  // The same rule for the track that was aimed at as for the one picked for it: a muted track
  // accepted under the pointer and skipped otherwise is two rules for one question.
  const target = aimed && takes(state, aimed, kind) ? aimed : landingTrack(state, kind)
  if (!target) return []

  const clip = clipForAsset(assetId, asset, start, state.settings)
  const sound = kind === 'video' && hasSound(asset) ? landingTrack(state, 'audio') : null
  return pairedPlacements(clip, target.id, sound?.id ?? null)
}
