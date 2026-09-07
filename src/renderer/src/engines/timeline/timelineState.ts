/**
 * A sequence, as plain data. It holds no decoder and no Pixi object: an engine is rebuilt from
 * its serialized state, never from its DOM, and jsdom has neither WebCodecs nor WebGL.
 */
import {
  SECOND,
  frameDuration as frameOf,
  snapToFrame as snapOf,
  type Us,
} from '@shared/domain/time'
import { clamp, clampAtLeast } from '@shared/numeric'
// Re-exported where the montage has always read them from: a scene's animation is written in the
// same unit, so the definition moved to `shared/` where both sides may reach it.
export { SECOND }
export type { Us }

export type SequenceSettings = {
  width: number
  height: number
  fps: number
  sampleRate: number
}

export type TrackKind = 'video' | 'audio'

/** Both of them, for the same reason as `LAYER_KINDS`: the inspector names a track by its kind. */
export const TRACK_KINDS: readonly TrackKind[] = ['video', 'audio']

/** Which end of a clip an edit works on — a trim, a fade, a snap candidate. */
export type ClipEdge = 'in' | 'out'

export const CLIP_EDGES: readonly ClipEdge[] = ['in', 'out']

export type Clip = {
  id: string
  /**
   * Resolved against the project catalogue, never against a file path. Empty for a clip whose
   * picture is a scene: a document is not a catalogue row, and `sceneId` names it instead.
   */
  assetId: string
  /**
   * The scene document this clip draws, rendered as the head passes over it rather than read
   * from a file. That is what makes an edit to the scene show up in the montage at once — the
   * whole point of a live clip, and what a rendered film can never do.
   */
  sceneId?: string
  start: Us
  duration: Us
  /** Entry point inside the source media. */
  inPoint: Us
  speed: number
  /** Ramp lengths measured from each end of the clip. */
  fadeIn: Us
  fadeOut: Us
  /** Decibels, audio only. Zero leaves the clip as it was recorded. */
  gain: number
  /**
   * What ties a take's picture to its sound: both clips carry the same value, and every edit
   * that moves, trims, cuts or deletes one does the same to the other. A rush laid down as two
   * clips that drift apart on the first drag is worse than one laid down as a mute picture.
   *
   * Absent for a clip that stands alone — a sound, a still, a rush with no audio stream, or a
   * pair the user has unlinked to treat each half on its own.
   */
  linkId?: string
}

export type Track = {
  id: string
  kind: TrackKind
  /** Shown in the header column. The id identifies, the name is what the user renames. */
  name: string
  /** Compositing order: higher wins. */
  index: number
  /** Row height in CSS pixels, dragged from the header. */
  height: number
  muted: boolean
  solo: boolean
  locked: boolean
  /** Sorted by `start`, never overlapping — `insertClip` is what guarantees it. */
  clips: Clip[]
}

export type SequenceState = {
  settings: SequenceSettings
  tracks: Track[]
  /** The clip the montage works on: the strip's highlight, the take editor, the source monitor. */
  selectedId: string | null
  /**
   * The row the inspector describes. NOT exclusive with the clip — the take editor keeps its
   * block while a header is renamed beside it — but `selectClip` clears it, so the inspector
   * follows whichever was pressed last.
   *
   * 🛑 Both halves are SAVED with the montage, and this montage is the only document of the
   * studio that does it: `sceneState.ts` writes the opposite in as many words, and an `.ora`
   * recomputes its active layer on read. The divergence is deliberate — the pair is revalidated
   * against the tracks by `readSelection` — but nothing reconciles the two rules.
   */
  selectedTrackId: string | null
  playhead: Us
}

/** Both halves of what a montage designates — see the two fields above. */
export type SequenceSelection = Pick<SequenceState, 'selectedId' | 'selectedTrackId'>

/**
 * WHICH of the two a montage designates, resolved against what it still holds. One reader, or
 * the inspector and the assistant answer differently for a row that is no longer there.
 */
export type Designated = { kind: 'track'; track: Track } | { kind: 'clip'; clip: Clip } | null

export function designatedIn(state: SequenceState): Designated {
  const track = state.selectedTrackId ? trackById(state, state.selectedTrackId) : null
  if (track) return { kind: 'track', track }

  const clip = state.selectedId ? clipById(state, state.selectedId) : null
  return clip ? { kind: 'clip', clip } : null
}

/** Selecting a clip takes the inspector off whatever row it was describing. */
export function selectClip(state: SequenceState, clipId: string | null): SequenceState {
  return { ...state, selectedId: clipId, selectedTrackId: null }
}

/** Selecting a row leaves the clip alone — see `selectedTrackId`. */
export function selectTrack(state: SequenceState, trackId: string | null): SequenceState {
  return { ...state, selectedTrackId: trackId }
}

export const DEFAULT_SETTINGS: SequenceSettings = {
  width: 1920,
  height: 1080,
  fps: 25,
  sampleRate: 48_000,
}

export const DEFAULT_TRACK_HEIGHT = 56
/** Below this a waveform is unreadable; above it one track fills the strip. */
export const MIN_TRACK_HEIGHT = 28
export const MAX_TRACK_HEIGHT = 200

export function clampTrackHeight(height: number): number {
  return clamp(Math.round(height), MIN_TRACK_HEIGHT, MAX_TRACK_HEIGHT)
}

/** Below -60 dB nothing is audible, and above +12 dB generated audio only clips. */
export const MIN_GAIN_DB = -60
export const MAX_GAIN_DB = 12

export function clampGain(gain: number): number {
  return clamp(gain, MIN_GAIN_DB, MAX_GAIN_DB)
}

/** The range every media element agrees to resample without dropping to silence. */
export const MIN_SPEED = 0.25
export const MAX_SPEED = 4

export function clampSpeed(speed: number): number {
  return clamp(speed, MIN_SPEED, MAX_SPEED)
}

export type ClipInit = Pick<Clip, 'id' | 'assetId' | 'start' | 'duration'> & Partial<Clip>

/**
 * The one place a clip is born. Written once so a dropped clip, a pasted clip and a clip read
 * back from disk cannot disagree on what an untouched fade or an untouched gain is.
 */
export function makeClip(init: ClipInit): Clip {
  return { inPoint: 0, speed: 1, fadeIn: 0, fadeOut: 0, gain: 0, ...init }
}

export type TrackInit = Pick<Track, 'id' | 'kind' | 'index'> & Partial<Track>

export function makeTrack(init: TrackInit): Track {
  return {
    name: init.id,
    height: DEFAULT_TRACK_HEIGHT,
    muted: false,
    solo: false,
    locked: false,
    clips: [],
    ...init,
  }
}

/** A new sequence opens on one video and one audio track: a timeline you cannot drop on is a bug. */
export const EMPTY_SEQUENCE: SequenceState = {
  settings: DEFAULT_SETTINGS,
  tracks: [
    makeTrack({ id: 'V1', kind: 'video', index: 1 }),
    makeTrack({ id: 'A1', kind: 'audio', index: 0 }),
  ],
  selectedId: null,
  selectedTrackId: null,
  playhead: 0,
}

/**
 * What the Audio workspace opens on: the same montage, with nothing but sound in it.
 *
 * Four tracks rather than the one a sequence opens with, and it is a decision about the work
 * being done: music is layered — a rhythm, a bass, a harmony, a voice — and a person building it
 * lays the second sound down within seconds of the first. One track means the very first gesture
 * is "add a track", every time.
 *
 * No picture track at all, so a video dropped here lands nowhere rather than being montaged into
 * a space that has no monitor to show it.
 */
export const EMPTY_SOUND_SEQUENCE: SequenceState = {
  settings: DEFAULT_SETTINGS,
  // `reindexTracks` rather than an index written by hand: it is the one place that decides what
  // depth a row carries, and a second copy of that arithmetic is what makes the painter and the
  // header column disagree about which track is on top.
  tracks: reindexTracks(
    [1, 2, 3, 4].map(number => makeTrack({ id: `A${number}`, kind: 'audio', index: 0 })),
  ),
  selectedId: null,
  selectedTrackId: null,
  playhead: 0,
}

/** The letter a kind's tracks are named after, on the pattern `EMPTY_SEQUENCE` opens with. */
const TRACK_PREFIX: Record<TrackKind, string> = { video: 'V', audio: 'A' }

/**
 * The next free name of a kind — V1, V2, A1… — rather than a uuid: `makeTrack` names a track by
 * its id, and a header column reading `track_9f3c…` shows a name nobody typed. Renaming is a
 * command of its own, so this only has to be free, not final.
 */
export function nextTrackId(tracks: readonly Track[], kind: TrackKind): string {
  const taken = new Set(tracks.map(track => track.id))
  const prefix = TRACK_PREFIX[kind]

  for (let n = 1; ; n += 1) {
    const id = `${prefix}${n}`
    if (!taken.has(id)) return id
  }
}

/**
 * Depth read back from position: the first row of the column is drawn last, so it is the one
 * seen on top. `videoTracksByDepth` sorts on `index` while the header column reads the array —
 * without this the two disagree the moment a track is added, removed or moved.
 */
export function reindexTracks(tracks: readonly Track[]): Track[] {
  return tracks.map((track, position) => ({ ...track, index: tracks.length - 1 - position }))
}

// Adapters over the shared pair: a sequence carries four settings where the grid needs one. They
// exist so the montage's call sites stay untouched while another branch is editing them.
export function frameDuration(settings: SequenceSettings): Us {
  return frameOf(settings.fps)
}

export function snapToFrame(time: Us, settings: SequenceSettings): Us {
  return snapOf(time, settings.fps)
}

/**
 * A clip lasts a whole number of frames. Half a frame cannot be shown, and a duration off the
 * grid puts the clip's tail off it too — which no neighbour can then be butt-joined against.
 */
export function wholeFrames(duration: Us, settings: SequenceSettings): Us {
  const frame = frameDuration(settings)
  return Math.max(frame, Math.round(duration / frame) * frame)
}

/**
 * A clip born from a cut needs an id of its own. Deriving it from the one it was cut out of
 * collides as soon as that clip is cut a second time, and two clips sharing an id break every
 * lookup, starting with selection.
 */
export function newClipId(): string {
  return `clip_${crypto.randomUUID()}`
}

export function clipEnd(clip: Clip): Us {
  return clip.start + clip.duration
}

/**
 * What tells a scene source from a catalogue one, in the single string the decoder pool keys on.
 *
 * Spelled into the key rather than looked up: the pool opens a source ONCE and keeps it, so the
 * kind has to be known at that moment — a scene whose document is still being read off disk
 * would otherwise be opened as a media file and written off as undecodable for good.
 */
export const SCENE_SOURCE_PREFIX = 'scene:'

/**
 * What a clip draws from, as one key. The decoder pool holds one sink per source, and a scene
 * and an asset must never collide in it — they are two different things to open.
 */
export function clipSource(clip: Clip): string {
  return clip.sceneId ? `${SCENE_SOURCE_PREFIX}${clip.sceneId}` : clip.assetId
}

/** The document a source names, or `null` when it names a catalogue asset instead. */
export function sceneIdOfSource(source: string): string | null {
  return source.startsWith(SCENE_SOURCE_PREFIX) ? source.slice(SCENE_SOURCE_PREFIX.length) : null
}

/** Timeline time → time inside the source, through the in point and the speed. */
export function sourceTimeAt(clip: Clip, time: Us): Us {
  return clip.inPoint + Math.round((time - clip.start) * clip.speed)
}

/**
 * The part of a clip that starts at `time`: it begins that much later in the source. Three edits
 * need this and must agree — a trim of the in point, a split, and the tail an insertion cuts
 * loose — because a source offset off by a hair drifts the picture against the sound.
 */
export function clipFrom(clip: Clip, time: Us): Clip {
  return {
    ...clip,
    start: time,
    duration: clipEnd(clip) - time,
    // Never negative: a still pulled leftwards runs before its own in point, and there is no
    // earlier frame to seek to. `readPositive` drops a negative one when the project is read
    // back, so the clip would return other than the one that was saved.
    inPoint: Math.max(0, sourceTimeAt(clip, time)),
  }
}

/**
 * Fades that overlap would raise the level in the middle instead of lowering it at both ends.
 * Trimming a clip shorter than its own ramps is the ordinary way to get there.
 */
export function clampFades(clip: Clip): Clip {
  const fadeIn = clampAtLeast(clip.fadeIn, 0, clip.duration)
  const fadeOut = clampAtLeast(clip.fadeOut, 0, clip.duration - fadeIn)
  return fadeIn === clip.fadeIn && fadeOut === clip.fadeOut ? clip : { ...clip, fadeIn, fadeOut }
}

/**
 * Whether a track reaches the output. One track soloed anywhere silences every track that is
 * not — that is what solo means, and reading `muted` alone would let them all through.
 */
export function playsThrough(state: SequenceState, track: Track): boolean {
  if (track.muted) return false
  return state.tracks.some(candidate => candidate.solo) ? track.solo : true
}

/** Where the sequence stops: the last frame any track still shows something on. */
export function sequenceDuration(state: SequenceState): Us {
  let end: Us = 0
  for (const track of state.tracks) {
    for (const clip of track.clips) end = Math.max(end, clipEnd(clip))
  }
  return end
}

export function trackById(state: { tracks: readonly Track[] }, id: string): Track | null {
  return state.tracks.find(track => track.id === id) ?? null
}

/** A locked track refuses every edit, whether it is a command applying or a clip being dropped. */
export function editableTrack(state: SequenceState, id: string): Track | null {
  const track = trackById(state, id)
  return track && !track.locked ? track : null
}

/**
 * Whether the montage holds a row of this kind — the question two callers were each answering
 * for themselves: what a drop may open a row for, and whether a pair of halves can exist here
 * at all. It belongs to the state, not to the inserter nor to the painter.
 */
export function hasTrackOfKind(state: SequenceState, kind: TrackKind): boolean {
  return state.tracks.some(track => track.kind === kind)
}

export function trackOfClip(state: { tracks: readonly Track[] }, clipId: string): Track | null {
  return state.tracks.find(track => track.clips.some(clip => clip.id === clipId)) ?? null
}

/**
 * Every clip a link ties to this one, itself first and always present — an unlinked clip is a
 * group of one, which is what lets every edit run through the same path whether it is tied to
 * anything or not.
 */
export function linkedClipIds(state: SequenceState, clipId: string): string[] {
  const clip = clipById(state, clipId)
  if (!clip?.linkId) return clip ? [clipId] : []

  const { linkId } = clip
  const twins: string[] = []
  for (const track of state.tracks) {
    for (const candidate of track.clips) {
      if (candidate.id !== clipId && candidate.linkId === linkId) twins.push(candidate.id)
    }
  }
  return [clipId, ...twins]
}

export function clipById(state: SequenceState, id: string): Clip | null {
  for (const track of state.tracks) {
    const found = track.clips.find(clip => clip.id === id)
    if (found) return found
  }
  return null
}

/**
 * The clip a key press acts on. The selection wins while the playhead is inside it — that is
 * the one the user is looking at — and otherwise whatever the playhead crosses, so a blade
 * works without selecting first.
 */
export function clipUnderPlayhead(state: SequenceState): Clip | null {
  const spans = (clip: Clip): boolean =>
    state.playhead > clip.start && state.playhead < clipEnd(clip)

  const selected = state.selectedId ? clipById(state, state.selectedId) : null
  if (selected && spans(selected)) return selected

  for (const track of state.tracks) {
    if (track.locked) continue
    const found = track.clips.find(spans)
    if (found) return found
  }
  return null
}

/** Rewrites one track in place. The single spot that knows how to keep the others untouched. */
export function updateTrack(
  state: SequenceState,
  trackId: string,
  change: (track: Track) => Track,
): SequenceState {
  return {
    ...state,
    tracks: state.tracks.map(track => (track.id === trackId ? change(track) : track)),
  }
}

/** Rewrites one clip wherever it sits. Fades are re-clamped, so no caller has to remember to. */
export function updateClip(
  state: SequenceState,
  clipId: string,
  change: (clip: Clip) => Clip,
): SequenceState {
  return {
    ...state,
    tracks: state.tracks.map(track =>
      track.clips.some(clip => clip.id === clipId)
        ? {
            ...track,
            clips: track.clips.map(clip => (clip.id === clipId ? clampFades(change(clip)) : clip)),
          }
        : track,
    ),
  }
}

/**
 * Overwrite insertion: the dropped clip wins, and what it covers is trimmed, split or dropped.
 * This is what keeps "sorted by start, never overlapping" true without asking callers to care.
 *
 * `tailId` names the clip an insertion landing mid-neighbour cuts loose. It is an input rather
 * than something minted here: a reducer that invents an id is no longer a pure function of its
 * state, and this one runs on every pointer move of a drag.
 */
export function insertClip(track: Track, clip: Clip, tailId: string): Track {
  const end = clipEnd(clip)
  const clips: Clip[] = []

  for (const existing of track.clips) {
    const existingEnd = clipEnd(existing)
    if (existingEnd <= clip.start || existing.start >= end) {
      clips.push(existing)
      continue
    }

    // Head survives: the part before the newcomer keeps its own in point.
    if (existing.start < clip.start) {
      clips.push(clampFades({ ...existing, duration: clip.start - existing.start }))
    }

    // Tail survives: it starts later in the source, so its in point moves with it.
    if (existingEnd > end) {
      const cutInTwo = existing.start < clip.start
      const tail = clampFades({
        ...clipFrom(existing, end),
        id: cutInTwo ? tailId : existing.id,
      })
      // A newcomer landing inside a linked take leaves two pieces of it. They must not both
      // answer to the same link: dragging the head would then drag the far side of the cut,
      // and deleting it would take that away too. The head keeps the sound it was laid with,
      // and the tail stands alone — which is what an insertion into a take really produces.
      if (cutInTwo) delete tail.linkId
      clips.push(tail)
    }
  }

  clips.push(clampFades(clip))
  return { ...track, clips: clips.sort((left, right) => left.start - right.start) }
}
