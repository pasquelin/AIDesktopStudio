import {
  DIRECT_PROPERTIES,
  POSE_PROPERTIES,
  SCENE_SUBJECT_ID,
  type AnimationTimeline,
  type AnimationTrack,
  type Keyframe,
  type TrackProperty,
  type TrackTarget,
} from '@shared/domain/animation'
import type { Vector3 } from '@shared/domain/scene'
import type { Us } from '@shared/domain/time'
import { type Command } from '../core/history'
import { deltaOf, poseAt, valueAt, withKey, withoutKey } from './animationEval'
import { moveNodes, multi } from './commands'
import { nodeById, type NodeMove, type SceneState } from './sceneState'

/**
 * Edits of the timeline, on the pattern of the sequence's own track commands: what a command
 * needs to revert is captured as it is APPLIED, never as it is built.
 *
 * They are separate from `commands.ts` because they touch one field of the state and none of the
 * nodes — and because a timeline edit that reached into a node would be the thing this whole
 * additive design exists to avoid.
 */

/**
 * The sheet is deliberately LEFT ALONE here: a revert would have had to put it back too, in every
 * command that writes a track. `animationRows` gives a line to whoever holds one instead.
 */
const write = (
  state: SceneState,
  change: (tracks: readonly AnimationTrack[]) => AnimationTrack[],
): SceneState => ({
  ...state,
  animation: { ...state.animation, tracks: rowIndexed(change(state.animation.tracks)) },
})

/**
 * Row order read back from position, so the array and the numbers cannot drift apart.
 *
 * NOT `reindexTracks` of the montage, which reads a DEPTH — there the first row is drawn last, so
 * its number is the highest. Here the tracks add up and none hides another: the number is the row.
 */
const rowIndexed = (tracks: readonly AnimationTrack[]): AnimationTrack[] =>
  tracks.map((track, position) => ({ ...track, index: position }))

/**
 * One track rewritten, as a pure function of the state. Exported because the flags of a track —
 * muted, solo, locked, armed — are how one WORKS rather than what one made: they go through the
 * store without an entry in the history, exactly as a montage's do.
 */
export const updateAnimationTrack = (
  state: SceneState,
  trackId: string,
  change: (track: AnimationTrack) => AnimationTrack,
): SceneState =>
  write(state, tracks => tracks.map(track => (track.id === trackId ? change(track) : track)))

const editTrack = updateAnimationTrack

const trackById = (state: SceneState, trackId: string): AnimationTrack | undefined =>
  state.animation.tracks.find(track => track.id === trackId)

export function recordingTracksFor(
  timeline: AnimationTimeline,
  nodeId: string,
  bone?: string,
): AnimationTrack[] {
  return timeline.tracks.filter(
    track => !track.locked && track.target.nodeId === nodeId && track.target.bone === bone,
  )
}

/**
 * Adds a track for one property of one target. The id is minted with the command rather than
 * inside `apply`: a redo must name the same track the undo took away, or nothing that referred
 * to it — an armed flag, a selection — finds it again.
 */
export function addAnimationTrack(
  target: TrackTarget,
  name: string,
  id: string,
): Command<SceneState> {
  return {
    id: `track:add:${id}`,
    apply: state =>
      write(state, tracks => [
        ...tracks,
        {
          id,
          name,
          index: tracks.length,
          muted: false,
          solo: false,
          locked: false,
          target,
          // Captured as it is APPLIED, like everything else here: the pose to measure keys
          // against is the one the object stands in now, not when the command was built.
          rest: target.bone ? undefined : nodeById(state, target.nodeId)?.transform,
          keys: [],
        },
      ]),
    revert: state => write(state, tracks => tracks.filter(track => track.id !== id)),
  }
}

export function removeAnimationTrack(trackId: string): Command<SceneState> {
  let before: { position: number; track: AnimationTrack } | null = null

  return {
    id: `track:remove:${trackId}`,
    apply: state => {
      const tracks = state.animation.tracks
      const position = tracks.findIndex(track => track.id === trackId)
      const track = tracks[position]
      if (!track || track.locked) return state

      before = { position, track }
      return write(state, current => current.filter(candidate => candidate.id !== trackId))
    },
    revert: state => {
      const origin = before
      if (!origin) return state
      return write(state, tracks => {
        const restored = [...tracks]
        restored.splice(origin.position, 0, origin.track)
        return restored
      })
    },
  }
}

/**
 * A command that rewrites the keys of ONE track and takes them back whole.
 *
 * Written once because setting, removing and moving a key had it spelt identically: the undo of
 * any of them is the list as it stood, and there is no cleverer inverse to find.
 *
 * Two ways for `next` to decline, and they are the same answer to the caller — the track is
 * missing or locked, or `next` itself returns null because what it was asked to move is no longer
 * there. In both cases the state is handed back untouched and `previous` stays null, which is
 * what makes the revert of a refused command a no-op rather than a restore of someone else's keys.
 */
function keysCommand(
  id: string,
  trackId: string,
  next: (keys: readonly Keyframe[]) => readonly Keyframe[] | null,
): Command<SceneState> {
  let previous: readonly Keyframe[] | null = null

  return {
    id,
    apply: state => {
      const track = trackById(state, trackId)
      if (!track || track.locked) return state

      const keys = next(track.keys)
      if (keys === null) return state

      previous = track.keys
      return editTrack(state, trackId, current => ({ ...current, keys }))
    },
    revert: state => {
      const origin = previous
      return origin === null
        ? state
        : editTrack(state, trackId, track => ({ ...track, keys: origin }))
    },
  }
}

/**
 * Writes a key at that instant, replacing whatever stood there.
 *
 * The value is a DELTA — what this track adds to the pose underneath — because tracks add up.
 * Whoever calls this has already worked out the difference between where the object is and where
 * it rests; the command is not the place to guess it.
 */
export function setAnimationKey(
  trackId: string,
  time: number,
  value: Vector3,
): Command<SceneState> {
  return keysCommand(`key:set:${trackId}`, trackId, keys => withKey(keys, { time, value }))
}

export function removeAnimationKey(trackId: string, time: number): Command<SceneState> {
  return keysCommand(`key:remove:${trackId}`, trackId, keys => withoutKey(keys, time))
}

/**
 * What a subject can be keyed on: the three of a pose, plus the lens when it is a camera and the
 * subject is the node itself.
 *
 * Read off the node rather than fixed, so keying a cube never opens a channel that drives
 * nothing — and a bone, which lives inside a file, has no lens of its own to open.
 */
export function keyableProperties(
  state: SceneState,
  subject: { nodeId: string; bone?: string },
): readonly TrackProperty[] {
  // The scene's composition has no pose and no lens: its channels are opened one parameter at a
  // time from the composition panel, so the band's diamond must open none of its own.
  if (subject.nodeId === SCENE_SUBJECT_ID) return []

  const camera = !subject.bone && nodeById(state, subject.nodeId)?.type === 'camera'
  return camera ? DIRECT_PROPERTIES : POSE_PROPERTIES
}

/**
 * Keys an object that may hold no channel yet, creating the ones it lacks — demanding a "track"
 * first would ask for the thing already standing in the viewport. Ids are minted here rather than
 * inside `apply`: a redo must name the same channels the undo took away.
 */
export function keyNode(
  state: SceneState,
  subject: { nodeId: string; bone?: string },
  time: Us,
  names: Readonly<Record<TrackProperty, string>>,
  mintId: (property: TrackProperty) => string,
  /** One channel rather than the whole pose. The band's diamond names none; a client may. */
  only?: TrackProperty,
  /** The instant the subject is SEEN at — the playhead — when the key lands elsewhere. */
  seenAt: Us = time,
): Command<SceneState> | null {
  const held = recordingTracksFor(state.animation, subject.nodeId, subject.bone)
  const missing = keyableProperties(state, subject)
    .filter(property => only === undefined || property === only)
    .filter(property => !held.some(track => track.target.property === property))

  const opened: Command<SceneState>[] = missing.map(property =>
    addAnimationTrack(
      subject.bone
        ? { nodeId: subject.nodeId, bone: subject.bone, property }
        : { nodeId: subject.nodeId, property },
      names[property],
      mintId(property),
    ),
  )

  // Applied first so the keys land on channels that exist: the state a command reads is the one
  // the commands before it produced, and `keySubject` reads the tracks by id.
  const opening = opened.reduce((current, command) => command.apply(current), state)
  const ids = recordingTracksFor(opening.animation, subject.nodeId, subject.bone)
    .filter(track => only === undefined || track.target.property === only)
    .map(track => track.id)

  const keys = keySubject(opening, ids, time, seenAt)
  if (!keys) return opened.length === 0 ? null : multi('key:node', opened)

  return multi('key:node', [...opened, keys])
}

/**
 * A key on every channel of one subject, holding where the object STANDS right now.
 *
 * This is what a sheet's key button does — Blender spells it `LocRotScale` — and it is the whole
 * difference between a usable band and the one that wrote a neutral value: a key that holds
 * nothing moves nothing, so pressing the button appeared to do nothing at all.
 *
 * One command whatever the channel count, so a key costs one ⌘Z rather than three.
 */
export function keySubject(
  state: SceneState,
  trackIds: readonly string[],
  time: Us,
  seenAt: Us = time,
): Command<SceneState> | null {
  const writes: Command<SceneState>[] = []

  const moved: NodeMove[] = []

  for (const trackId of trackIds) {
    const track = trackById(state, trackId)
    if (!track || track.locked) continue
    keyTrack(state, track, time, seenAt, writes, moved)
  }

  if (writes.length === 0) return null
  if (moved.length > 0) writes.push(moveNodes(dedupeMoves(moved)))

  return writes.length === 1 && writes[0] ? writes[0] : multi('key:subject', writes)
}

function keyTrack(
  state: SceneState,
  track: AnimationTrack,
  time: Us,
  seenAt: Us,
  writes: Command<SceneState>[],
  moved: NodeMove[],
): void {
  const rest = track.rest
  const node = rest ? nodeById(state, track.target.nodeId) : undefined
  if (rest && node) {
    // The pose on SCREEN, not the stored one: an animated node stores its rest, and measuring the
    // rest against itself wrote a key that held nothing — measured 2026-09-06, keyed at 3 s.
    const pose = poseAt(node.transform, state.animation, node.id, seenAt)
    writes.push(setAnimationKey(track.id, time, deltaOf(rest, pose, track.target.property)))
    moved.push({ id: track.target.nodeId, transform: rest })
    return
  }
  writes.push(setAnimationKey(track.id, time, valueAt(track, time)))
}

/** One entry per node: three channels of one object all ask it back to the same pose. */
function dedupeMoves(moves: readonly NodeMove[]): NodeMove[] {
  const byId = new Map(moves.map(move => [move.id, move]))
  return [...byId.values()]
}

// Narrowed as it is gathered: a `filter` on the same predicate leaves `AnimationTrack | undefined`
// behind, and both callers then need a non-null assertion to read the track they just kept.
function unlockedTracks(
  state: SceneState,
  trackIds: readonly string[],
  keeps: (track: AnimationTrack) => boolean,
): AnimationTrack[] {
  return trackIds.flatMap(trackId => {
    const track = trackById(state, trackId)
    return track && !track.locked && keeps(track) ? [track] : []
  })
}

/**
 * Takes a key off every channel of one subject at that instant.
 *
 * The counterpart of `keySubject`, and it has to exist: a pose one cannot undo is a pose one is
 * stuck with, and the old panel's diamond removed what it had posed.
 */
export function unkeySubject(
  state: SceneState,
  trackIds: readonly string[],
  time: Us,
): Command<SceneState> | null {
  const drops = unlockedTracks(state, trackIds, track =>
    track.keys.some(key => key.time === time),
  ).map(track => removeAnimationKey(track.id, time))

  if (drops.length === 0) return null
  return drops.length === 1 && drops[0] ? drops[0] : multi('key:unset', drops)
}

/**
 * Empties every channel of one subject, whatever instant its keys sit on.
 *
 * 🛑 There was no way to say « efface toutes les clés » in one call: `unkeySubject` takes one
 * instant, so a client asking for all of them sent the same call over and over — measured on the
 * bench pass of 2026-08-26, and it never cleared more than the key under the head.
 */
export function unkeySubjectWholly(
  state: SceneState,
  trackIds: readonly string[],
): Command<SceneState> | null {
  const drops = unlockedTracks(state, trackIds, track => track.keys.length > 0).map(track =>
    keysCommand(`key:clear:${track.id}`, track.id, () => []),
  )

  if (drops.length === 0) return null
  return drops.length === 1 && drops[0] ? drops[0] : multi('key:clear', drops)
}

/**
 * Slides a key along its track, keeping its value.
 *
 * A key landing on an instant another already holds REPLACES it, which is what `withKey` does
 * everywhere else — two keys on one frame is a state no evaluation can read twice.
 */
export function moveAnimationKey(trackId: string, from: Us, to: Us): Command<SceneState> {
  return keysCommand(`key:move:${trackId}`, trackId, keys => {
    const moving = keys.find(key => key.time === from)
    // The key named is gone — dropped by another window between the grab and the release.
    return moving ? withKey(withoutKey(keys, from), { time: to, value: moving.value }) : null
  })
}
