import { isVector3 } from '@shared/domain/scene'
import {
  DEFAULT_DURATION,
  DEFAULT_FPS,
  EASINGS,
  EMPTY_TIMELINE,
  sheetFromAnimated,
  TIMELINE_TEMPLATES,
  TRACK_PROPERTIES,
  TRANSITION_KINDS,
  type AnimationTimeline,
  type AnimationTrack,
  type CameraShot,
  type Keyframe,
  type TimelineEvent,
  type TimelineMedia,
  type TimelineTemplate,
  type TimelineTransition,
  type TransitionKind,
} from '@shared/domain/animation'
import { isRecord, readNumber } from '@shared/guards'
import type { SceneNode } from './sceneState'

function playingModels(nodes: readonly SceneNode[]): string[] {
  return nodes.flatMap(node =>
    node.type === 'model' && (node.model.lanes ?? []).some(lane => lane.clips.length > 0)
      ? node.id
      : [],
  )
}

export function readTimeline(value: unknown, nodes: readonly SceneNode[]): AnimationTimeline {
  if (!isRecord(value)) return EMPTY_TIMELINE

  const tracks = Array.isArray(value.tracks) ? value.tracks.filter(isTrack) : []
  const shots = shotsInOrder(Array.isArray(value.shots) ? value.shots.filter(isShot) : [])
  // `readNumber` gives the fallback for anything that is not a finite number; zero and below are
  // finite and still meaningless here, so the positive test stays.
  const duration = readNumber(value, 'duration', DEFAULT_DURATION)
  const fps = readNumber(value, 'fps', DEFAULT_FPS)

  // 🛑 Read back or LOST: a save recomposes the timeline whole from the state, so a row this
  // build does not read is a row the next `⌘S` drops without a word — see `sceneHoldsMore`,
  // which is what tells a reader before it happens.
  const events = readList(value.events, isTimelineEvent)
  const audio = readList(value.audio, isTimelineMedia)
  const video = readList(value.video, isTimelineMedia)
  const transitions = readList(value.transitions, isTimelineTransition)

  return {
    duration: duration > 0 ? duration : DEFAULT_DURATION,
    fps: fps > 0 ? fps : DEFAULT_FPS,
    tracks,
    shots,
    sheet: readSheet(value.sheet, tracks, shots, playingModels(nodes)),
    // Absent rather than empty: a document that never had one must come back as it was written,
    // and `document.test.ts` compares what a round trip gives back.
    ...presentTimelineRows(events, audio, video, transitions),
    ...(isTimelineTemplate(value.template) ? { template: value.template } : {}),
  }
}

function presentTimelineRows(
  events: TimelineEvent[],
  audio: TimelineMedia[],
  video: TimelineMedia[],
  transitions: TimelineTransition[],
): Partial<AnimationTimeline> {
  return {
    ...(events.length > 0 ? { events } : {}),
    ...(audio.length > 0 ? { audio } : {}),
    ...(video.length > 0 ? { video } : {}),
    ...(transitions.length > 0 ? { transitions } : {}),
  }
}

/**
 * Which timeline rows of a WRITTEN animation this build cannot read back, named `events`,
 * `audio`, `video`, `transitions` or `template`.
 *
 * 🛑 Beside the reading rather than beside the guard that reports it: what a build keeps is
 * decided here, so a predicate that grows a case must not leave a second copy elsewhere saying
 * something else. Counted, because what is lost is the DIFFERENCE.
 */
export function timelineRowsLost(written: unknown): string[] {
  if (!isRecord(written)) return []

  const lists: readonly [string, (one: unknown) => boolean][] = [
    ['events', isTimelineEvent],
    ['audio', isTimelineMedia],
    ['video', isTimelineMedia],
    ['transitions', isTimelineTransition],
  ]
  const lost = lists
    .filter(([name, holds]) => {
      const rows = written[name]
      if (rows === undefined) return false
      // 🛑 Not an ARRAY at all — a later build keying its rows by id for an O(1) reach — is the
      // whole list lost, and the quietest way to lose one: `readList` answers empty and the
      // first ⌘S writes a timeline without it.
      if (!Array.isArray(rows)) return true
      // A row this build cannot read. A REPEATED id is not one of them: `readList` filters and
      // keeps every row that holds, duplicates included, so a save writes both back untouched.
      return rows.some(one => !holds(one))
    })
    .map(([name]) => name)

  // A template a later build named decides what a panel offers, and this one would drop it.
  if (written.template !== undefined && !isTimelineTemplate(written.template)) {
    lost.push('template')
  }
  // 🛑 A MEMBER this build has no name for — `markers`, `subtitles` — is lost the same way, and
  // the rule is the repository's own: a member COMPOSED from something narrower has to be looked
  // INTO. `readTimeline` recomposes the whole object from the names below, so anything else goes.
  lost.push(...Object.keys(written).filter(key => !TIMELINE_MEMBERS.has(key)))
  return lost
}

/** Every member `readTimeline` gives back. What is not here is what a save would drop. */
const TIMELINE_MEMBERS = new Set([
  'duration',
  'fps',
  'tracks',
  'shots',
  'sheet',
  'events',
  'audio',
  'video',
  'transitions',
  'template',
])

/** Whatever of a list this build can read, in order. Anything else is dropped, and SAID. */
const readList = <T>(value: unknown, holds: (one: unknown) => one is T): T[] =>
  Array.isArray(value) ? value.filter(holds) : []

const isTimelineEvent = (value: unknown): value is TimelineEvent =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.at === 'number' &&
  typeof value.name === 'string'

const isTimelineMedia = (value: unknown): value is TimelineMedia =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.assetId === 'string' &&
  typeof value.start === 'number' &&
  typeof value.duration === 'number'

const isTimelineTransition = (value: unknown): value is TimelineTransition =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.at === 'number' &&
  typeof value.duration === 'number' &&
  TRANSITION_KINDS.includes(value.kind as TransitionKind)

const isTimelineTemplate = (value: unknown): value is TimelineTemplate =>
  typeof value === 'string' && TIMELINE_TEMPLATES.includes(value as TimelineTemplate)

/**
 * Which objects the band shows. Without one, rebuilt ONCE from what is animated — a file written
 * before sheets existed would come back with its animated objects nowhere to be seen. WITH one,
 * taken as it stands, empty included: rebuilding would put back what someone removed on purpose.
 */
function readSheet(
  value: unknown,
  tracks: readonly AnimationTrack[],
  shots: readonly CameraShot[],
  playing: readonly string[],
): string[] {
  if (Array.isArray(value)) return value.filter(id => typeof id === 'string')
  return sheetFromAnimated(tracks, shots, playing)
}

/**
 * The shots in the order that settles an overlap, which is the list's own — see `activeShotAt`.
 *
 * A document written while `layer` existed is sorted by it ONCE, here, highest first and equal
 * layers by start, which is exactly the law those numbers used to spell. Read any later and the
 * field would have to survive for good; the shots go back out without it.
 */
function shotsInOrder(shots: readonly CameraShot[]): CameraShot[] {
  // Widened rather than kept in `CameraShot`: the field is on disk, and declaring it would make
  // every writer go on filling a number nothing reads.
  const written = shots as readonly (CameraShot & { layer?: number })[]

  // Only a file that HELD layers is re-sorted. Without this the comparator would fall through to
  // `start` on every document written since, undoing on each read the stack the user arranged.
  if (!written.some(shot => typeof shot.layer === 'number')) return [...written]

  return [...written]
    .sort((left, right) => (right.layer ?? 0) - (left.layer ?? 0) || left.start - right.start)
    .map(({ layer: _, ...kept }) => kept)
}

/**
 * Whether a shot is one. Its shape only: whether the camera it names still exists is a question
 * about the scene at an instant, and `activeShotAt` is the one place that asks it.
 */
function isShot(value: unknown): value is CameraShot {
  if (!isRecord(value)) return false
  if (typeof value.id !== 'string' || value.id === '') return false
  if (typeof value.cameraId !== 'string' || value.cameraId === '') return false
  if (!Number.isFinite(value.start)) return false
  if (!isOptionalMotion(value.motion) || !isOptionalTarget(value.target)) return false
  // A shot of no length covers no instant at all, so it could only ever be a hole in the band.
  return typeof value.duration === 'number' && value.duration > 0
}

/** Absent means a shot that does not move. A rail it names but the scene has lost is skipped
 * by `railCamera` rather than refused here — the same rule shots follow for their camera. */
function isOptionalMotion(value: unknown): boolean {
  if (value == null) return true
  if (!isRecord(value)) return false

  return (
    typeof value.pathId === 'string' &&
    EASINGS.some(easing => easing === value.easing) &&
    Number.isFinite(value.from) &&
    Number.isFinite(value.to)
  )
}

/** Absent means FREE: the camera is aimed by its own rotation and nothing else. */
function isOptionalTarget(value: unknown): boolean {
  if (value == null) return true
  if (!isRecord(value)) return false

  if (value.kind === 'point') return isVector3(value.at)
  return value.kind === 'node' && typeof value.nodeId === 'string'
}

function isTrack(value: unknown): value is AnimationTrack {
  if (!isRecord(value)) return false
  if (typeof value.id !== 'string' || value.id === '') return false
  if (typeof value.name !== 'string') return false
  if (!Number.isFinite(value.index)) return false
  const target = value.target
  if (!isRecord(target)) return false
  if (typeof target.nodeId !== 'string') return false
  if (target.bone !== undefined && typeof target.bone !== 'string') return false
  if (!TRACK_PROPERTIES.some(property => property === target.property)) return false
  // A composition channel that names no effect and no parameter drives nothing: kept, it would
  // sit on the sheet as a row whose keys reach nowhere.
  if (target.property === 'post' && !isPostTarget(target.post)) return false

  return Array.isArray(value.keys) && value.keys.every(isKeyframe)
}

function isPostTarget(value: unknown): boolean {
  return isRecord(value) && typeof value.effectId === 'string' && typeof value.param === 'string'
}

function isKeyframe(value: unknown): value is Keyframe {
  return isRecord(value) && Number.isFinite(value.time) && isVector3(value.value)
}

/**
 * A descriptor is what its `kind` names when every field that kind declares is there, and of the
 * type its control implies.
 */
