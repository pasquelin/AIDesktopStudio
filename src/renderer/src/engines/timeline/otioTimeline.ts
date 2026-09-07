/**
 * A montage, translated to OpenTimelineIO and back.
 *
 * The standard part is the truth: another application edits the cut, not our metadata. The
 * `aidesktopstudio` domain only RESTORES what the standard rounded away — an exact microsecond, a fade,
 * a gain — and it is ignored the moment it disagrees with the frame the standard holds. Trusting
 * it blindly would silently undo a trim made in Resolve.
 */
import { DOCUMENT_ID_KEY, STUDIO_METADATA_KEY } from '@shared/domain/document'
import {
  isOtioTimeline,
  otioStudioMetadata,
  type OtioClip,
  type OtioGap,
  type OtioLinearTimeWarp,
  type OtioMediaReference,
  type OtioRationalTime,
  type OtioTimeRange,
  type OtioTimeline,
  type OtioTrack,
  type OtioTrackItem,
} from '@shared/domain/otio'
import { frameDuration as frameOf } from '@shared/domain/time'
import { isRecord, readBoolean, readNumber, readPositive, readString } from '@shared/guards'
import {
  clampGain,
  clampSpeed,
  clampTrackHeight,
  clipEnd,
  DEFAULT_SETTINGS,
  DEFAULT_TRACK_HEIGHT,
  EMPTY_SEQUENCE,
  insertClip,
  makeClip,
  makeTrack,
  newClipId,
  nextTrackId,
  playsThrough,
  reindexTracks,
  type Clip,
  type SequenceState,
  type Track,
  type TrackKind,
  type Us,
} from './timelineState'
import { readSelection } from './timelineParsing'
export { montageHoldsMore, montageRebuildsExtended } from './otioInspection'

/** What a clip draws, as another application needs it named: a label, and a file or nothing. */
export type OtioSource = { name: string; url: string | null }

export type OtioWriteOptions = {
  /** The timeline's own name — the document's title. */
  name: string
  /**
   * Which document of the studio this file IS, when it is one. Written under the studio domain
   * and read back by the file layer: without it a montage renamed on disk becomes a different
   * document, its tab and its place in the layout going with the old name.
   */
  documentId?: string
  /**
   * What the WORKSPACE wants carried under the studio domain, beside what the montage itself
   * puts there — which kind of document the file is, and an audio take's chain of effects. The
   * core of OTIO carries it verbatim and never reads it.
   */
  studio?: Record<string, unknown>
  sourceOf: (clip: Clip) => OtioSource
}

/** What a clip points at once this project has answered for it. Empty for what it does not hold. */
export type OtioSourceIds = { assetId: string; sceneId: string }

/**
 * Where a clip's source is looked up. Asked the only question that has one answer: DOES THIS
 * PROJECT HOLD THESE IDS — the ids the file carries, and the url it points at.
 *
 * Never « where does the file come from ». A `.otioz` this machine exported and reimported has
 * ids this project DOES hold, and a flag saying « from elsewhere » dropped every scene clip of it
 * while the scenes sat in the same project. Relinking stays the caller's: this module never
 * guesses one from a path.
 */
export type OtioResolveSource = (asked: {
  /** What the studio metadata claims, empty when the file carries none. */
  assetId: string
  sceneId: string
  /** The standard part, which every montage carries and no metadata can contradict. */
  targetUrl: string
}) => OtioSourceIds

type Relinking = {
  resolve: OtioResolveSource
  /** Every clip this read let go of, by the name the file gave it. Filled as they are met. */
  dropped: string[]
}

const timeAt = (time: Us, fps: number): OtioRationalTime => ({
  OTIO_SCHEMA: 'RationalTime.1',
  rate: fps,
  value: Math.round(time / frameOf(fps)),
})

const rangeOf = (start: Us, duration: Us, fps: number): OtioTimeRange => ({
  OTIO_SCHEMA: 'TimeRange.1',
  start_time: timeAt(start, fps),
  duration: timeAt(duration, fps),
})

const gapOf = (duration: Us, fps: number): OtioGap => ({
  OTIO_SCHEMA: 'Gap.1',
  name: '',
  metadata: {},
  source_range: rangeOf(0, duration, fps),
  markers: [],
  effects: [],
  enabled: true,
})

const timeWarpOf = (speed: number): OtioLinearTimeWarp => ({
  OTIO_SCHEMA: 'LinearTimeWarp.1',
  name: '',
  metadata: {},
  effect_name: 'LinearTimeWarp',
  time_scalar: speed,
})

/** A scene has no file, whatever the caller answers: it is rendered as the head passes over it. */
function referenceOf(clip: Clip, source: OtioSource): OtioMediaReference {
  if (clip.sceneId || !source.url) {
    return {
      OTIO_SCHEMA: 'MissingReference.1',
      name: source.name,
      metadata: {},
      available_range: null,
    }
  }
  return {
    OTIO_SCHEMA: 'ExternalReference.1',
    name: source.name,
    metadata: {},
    // Unknown: the studio holds a rush's length only once a decoder has opened it, and an export
    // must not depend on what happens to be decoded.
    available_range: null,
    target_url: source.url,
  }
}

function clipOf(clip: Clip, fps: number, sourceOf: OtioWriteOptions['sourceOf']): OtioClip {
  const source = sourceOf(clip)
  return {
    OTIO_SCHEMA: 'Clip.1',
    name: source.name,
    metadata: {
      [STUDIO_METADATA_KEY]: {
        id: clip.id,
        assetId: clip.assetId,
        ...(clip.sceneId ? { sceneId: clip.sceneId } : {}),
        ...(clip.linkId ? { linkId: clip.linkId } : {}),
        start: clip.start,
        duration: clip.duration,
        inPoint: clip.inPoint,
        fadeIn: clip.fadeIn,
        fadeOut: clip.fadeOut,
        gain: clip.gain,
      },
    },
    source_range: rangeOf(clip.inPoint, clip.duration, fps),
    markers: [],
    enabled: true,
    effects: clip.speed === 1 ? [] : [timeWarpOf(clip.speed)],
    media_reference: referenceOf(clip, source),
  }
}

function trackOf(
  state: SequenceState,
  track: Track,
  fps: number,
  sourceOf: OtioWriteOptions['sourceOf'],
): OtioTrack {
  const children: OtioTrackItem[] = []
  let cursor: Us = 0
  for (const clip of track.clips) {
    if (clip.start > cursor) children.push(gapOf(clip.start - cursor, fps))
    children.push(clipOf(clip, fps, sourceOf))
    cursor = clipEnd(clip)
  }

  return {
    OTIO_SCHEMA: 'Track.1',
    name: track.name,
    metadata: {
      [STUDIO_METADATA_KEY]: {
        id: track.id,
        height: track.height,
        muted: track.muted,
        solo: track.solo,
        locked: track.locked,
      },
    },
    kind: track.kind === 'audio' ? 'Audio' : 'Video',
    children,
    source_range: null,
    effects: [],
    markers: [],
    // The RESULT rather than the two switches: a solo elsewhere silences this track, and that is
    // what another application has to be told. Which switch caused it rides in the metadata.
    enabled: playsThrough(state, track),
  }
}

/**
 * The studio metadata a save RECOMPOSES from the state, and its keys.
 *
 * Written here rather than listed by the reader that skips them: a key added to one copy and not
 * the other is carried AND written, and the spread hides it — nothing reddens.
 */
export function studioComposedBy(state: SequenceState): Record<string, unknown> {
  const { width, height, sampleRate } = state.settings
  return {
    width,
    height,
    sampleRate,
    playhead: state.playhead,
    selectedId: state.selectedId,
    selectedTrackId: state.selectedTrackId,
  }
}

export const STUDIO_COMPOSED_KEYS: readonly string[] = Object.keys(studioComposedBy(EMPTY_SEQUENCE))

/**
 * The montage as an OTIO timeline, ready to be serialized.
 *
 * Tracks come out BOTTOM first — the last child of a stack is the layer on top, the opposite of
 * the studio's array, whose head is what is seen.
 */
export function otioTimelineOf(
  state: SequenceState,
  { name, documentId, studio, sourceOf }: OtioWriteOptions,
): OtioTimeline {
  const { fps } = state.settings
  return {
    OTIO_SCHEMA: 'Timeline.1',
    name,
    metadata: {
      [STUDIO_METADATA_KEY]: {
        ...studio,
        ...(documentId ? { [DOCUMENT_ID_KEY]: documentId } : {}),
        ...studioComposedBy(state),
      },
    },
    global_start_time: timeAt(0, fps),
    tracks: {
      OTIO_SCHEMA: 'Stack.1',
      name: 'tracks',
      metadata: {},
      children: [...state.tracks].reverse().map(track => trackOf(state, track, fps, sourceOf)),
      source_range: null,
      effects: [],
      markers: [],
      enabled: true,
    },
  }
}

/**
 * The exact time the extension remembers, but only while it still names the frame the standard
 * holds. A clip moved or trimmed by another application makes them disagree, and then the
 * standard wins — the alternative is undoing that edit without saying so.
 */
function refined(studio: Record<string, unknown>, key: string, standard: Us, frame: Us): Us {
  const exact = readNumber(studio, key, standard)
  return Math.round(exact / frame) === Math.round(standard / frame) ? exact : standard
}

const usOf = (raw: unknown, frame: Us): Us => {
  if (!isRecord(raw)) return 0
  return Math.max(0, Math.round(readNumber(raw, 'value', 0)) * frame)
}

function rangeFrom(raw: unknown, frame: Us): { start: Us; duration: Us } {
  if (!isRecord(raw)) return { start: 0, duration: 0 }
  return { start: usOf(raw.start_time, frame), duration: usOf(raw.duration, frame) }
}

function speedFrom(raw: Record<string, unknown>): number {
  if (!Array.isArray(raw.effects)) return 1
  for (const effect of raw.effects) {
    if (isRecord(effect) && effect.OTIO_SCHEMA === 'LinearTimeWarp.1') {
      return clampSpeed(readNumber(effect, 'time_scalar', 1) || 1)
    }
  }
  return 1
}

function sourceIdsFrom(
  raw: Record<string, unknown>,
  studio: Record<string, unknown>,
  { resolve }: Relinking,
): OtioSourceIds {
  const reference = raw.media_reference
  return resolve({
    assetId: readString(studio, 'assetId', ''),
    sceneId: readString(studio, 'sceneId', ''),
    targetUrl: isRecord(reference) ? readString(reference, 'target_url', '') : '',
  })
}

function clipFrom(
  raw: Record<string, unknown>,
  standard: { start: Us; duration: Us },
  cursor: Us,
  frame: Us,
  linking: Relinking,
): Clip | null {
  const studio = otioStudioMetadata(raw)
  const duration = refined(studio, 'duration', standard.duration, frame)
  if (duration <= 0) return null

  const { assetId, sceneId } = sourceIdsFrom(raw, studio, linking)
  // The same refusal `parseSequence` makes: a clip with no source can be neither drawn nor played.
  if (!assetId && !sceneId) return null

  const linkId = readString(studio, 'linkId', '')
  return makeClip({
    id: readString(studio, 'id', '') || newClipId(),
    assetId,
    ...(sceneId ? { sceneId } : {}),
    ...(linkId ? { linkId } : {}),
    start: refined(studio, 'start', cursor, frame),
    duration,
    inPoint: refined(studio, 'inPoint', standard.start, frame),
    speed: speedFrom(raw),
    fadeIn: readPositive(studio, 'fadeIn', 0),
    fadeOut: readPositive(studio, 'fadeOut', 0),
    gain: clampGain(readNumber(studio, 'gain', 0)),
  })
}

/** A gap is not read back as anything: a hole is what the next clip's `start` already says. */
function clipsFrom(children: unknown, frame: Us, linking: Relinking): Clip[] {
  if (!Array.isArray(children)) return []

  const clips: Clip[] = []
  let cursor: Us = 0
  for (const raw of children) {
    if (!isRecord(raw)) continue

    const standard = rangeFrom(raw.source_range, frame)
    const clip =
      raw.OTIO_SCHEMA === 'Clip.1' ? clipFrom(raw, standard, cursor, frame, linking) : null
    if (clip) clips.push(clip)
    // Said HERE rather than left to each caller to instrument its own resolver: a clip is let go
    // of for three different reasons, and the second caller written did not think to count any.
    else if (raw.OTIO_SCHEMA === 'Clip.1') linking.dropped.push(readString(raw, 'name', ''))
    // A gap, or a clip nothing could name a source for: both only move the head along.
    cursor = clip ? clipEnd(clip) : cursor + standard.duration
  }
  return clips
}

function trackFrom(
  raw: unknown,
  row: number,
  frame: Us,
  linking: Relinking,
  taken: readonly Track[],
): Track | null {
  if (!isRecord(raw) || raw.OTIO_SCHEMA !== 'Track.1') return null

  const studio = otioStudioMetadata(raw)
  const kind: TrackKind = raw.kind === 'Audio' ? 'audio' : 'video'
  // A file written elsewhere names its tracks freely; the studio names them V1, A1… and the
  // numbering has to come from what is already read, not from the row.
  const id = readString(studio, 'id', '') || nextTrackId(taken, kind)
  const track = makeTrack({
    id,
    kind,
    index: row,
    name: readString(raw, 'name', id),
    height: clampTrackHeight(readNumber(studio, 'height', DEFAULT_TRACK_HEIGHT)),
    // A file written elsewhere has one switch where the studio has two, and a disabled track is
    // a muted one — a solo is a state of the montage, not of the track that survives it.
    muted: readBoolean(studio, 'muted', !readBoolean(raw, 'enabled', true)),
    solo: readBoolean(studio, 'solo', false),
    locked: readBoolean(studio, 'locked', false),
  })

  return clipsFrom(raw.children, frame, linking).reduce(
    (current, clip) => insertClip(current, clip, newClipId()),
    track,
  )
}

/** The frame rate every time in the file is counted in, taken from the first one that says. */
function fpsFrom(timeline: Record<string, unknown>, stack: Record<string, unknown>): number {
  const start = timeline.global_start_time
  if (isRecord(start)) {
    const rate = readNumber(start, 'rate', 0)
    if (rate > 0) return rate
  }

  const track = Array.isArray(stack.children) ? stack.children[0] : null
  const item = isRecord(track) && Array.isArray(track.children) ? track.children[0] : null
  const range = isRecord(item) ? item.source_range : null
  const duration = isRecord(range) ? range.duration : null
  const rate = isRecord(duration) ? readNumber(duration, 'rate', 0) : 0
  return rate > 0 ? rate : DEFAULT_SETTINGS.fps
}

/** A montage read back, with the clips the read let go of — see `readSequenceFromOtio`. */
export type OtioReading = { state: SequenceState; dropped: readonly string[] }

/**
 * A montage read back from an OTIO file, and what it could not keep. Answers the empty sequence on
 * anything that is not one, exactly as `parseSequence` does: a file that fails to read must not
 * open on nothing at all.
 *
 * `resolve` answers which ids a project holds. Its default takes the file at its word, which is
 * all a module with no catalogue can do — asking whether an id EXISTS is `sequenceDocument`'s,
 * and it is the only side that can. `dropped` is how a caller says what fell out.
 */
export function readSequenceFromOtio(
  content: unknown,
  resolve: OtioResolveSource = ({ assetId, sceneId }) => ({ assetId, sceneId }),
): OtioReading {
  const dropped: string[] = []
  return { state: sequenceIn(content, { resolve, dropped }), dropped }
}

/** The same read, for a caller with nowhere to say what was let go of. */
export function sequenceFromOtio(content: unknown, resolve?: OtioResolveSource): SequenceState {
  return readSequenceFromOtio(content, resolve).state
}

function sequenceIn(content: unknown, linking: Relinking): SequenceState {
  if (!isOtioTimeline(content)) return EMPTY_SEQUENCE
  const stack = content.tracks
  if (!isRecord(stack) || !Array.isArray(stack.children)) return EMPTY_SEQUENCE

  const fps = fpsFrom(content, stack)
  const frame = frameOf(fps)
  const tracks: Track[] = []
  const audible: boolean[] = []
  // Reversed back: the stack is written bottom first, the studio holds its tracks top first.
  ;[...stack.children].reverse().forEach((raw, row) => {
    const track = trackFrom(raw, row, frame, linking, tracks)
    if (!track || !isRecord(raw)) return
    tracks.push(track)
    audible.push(readBoolean(raw, 'enabled', true))
  })
  if (tracks.length === 0) return EMPTY_SEQUENCE

  const studio = otioStudioMetadata(content)
  const read: SequenceState = {
    settings: {
      width: readNumber(studio, 'width', DEFAULT_SETTINGS.width),
      height: readNumber(studio, 'height', DEFAULT_SETTINGS.height),
      fps,
      sampleRate: readNumber(studio, 'sampleRate', DEFAULT_SETTINGS.sampleRate),
    },
    tracks: reindexTracks(tracks),
    ...readSelection(studio, tracks),
    playhead: readPositive(studio, 'playhead', 0),
  }

  return { ...read, tracks: silencedAsWritten(read, audible) }
}

/**
 * The standard part wins over the switches the metadata remembers: a track muted by another
 * application would otherwise be unmuted in silence, its own `muted` still reading false.
 *
 * Only ever silences. A track ENABLED elsewhere while a solo here keeps it quiet stays quiet —
 * solo is a state of the montage, and honouring that half would mean editing another track.
 */
function silencedAsWritten(read: SequenceState, audible: readonly boolean[]): Track[] {
  return read.tracks.map((track, row) =>
    audible[row] === false && playsThrough(read, track) ? { ...track, muted: true } : track,
  )
}
