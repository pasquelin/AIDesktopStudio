import type { AnimationTrack, CameraShot } from '@shared/domain/animation'
import type { Us } from '@shared/domain/time'
import { ROW_PADDING } from './timelineGeometry'

/**
 * What a band is made of, whatever it is a band OF.
 *
 * Here rather than beside the scene's own builder, because two surfaces build these now: a
 * montage lays camera shots over a scene, and the skeleton window lays the keys of one motion.
 * The types belong to neither — see the rule about a type two halves share.
 */
export type Subject = {
  nodeId: string
  bone?: string
}

export type SubjectRow = {
  kind: 'subject'
  /** Stable across a fold, and what the expanded set holds — see `subjectKey`. */
  id: string
  name: string
  height: number
  expanded: boolean
  /** Every key of every channel, merged and deduplicated: what the folded line shows. */
  keys: readonly Us[]
  tracks: readonly AnimationTrack[]
  /**
   * The shots this camera is on air for, when the subject IS a camera the band stacks — absent
   * on every other line, which is what tells the two apart.
   *
   * On the subject's own line rather than a row of its own, because a camera and its shots are
   * one thing to a hand: the line carries the camera's NAME, its bars, and its channels folded
   * underneath. Two rows put the shot at the top of the sheet and the lens halfway down it.
   */
  bars?: readonly ShotBar[]
}

export type ChannelRow = {
  kind: 'channel'
  id: string
  name: string
  height: number
  track: AnimationTrack
}

/**
 * One lane of a subject's track, and the blocks laid along it — Blender's NLA rather than its
 * dope sheet.
 *
 * A lane holds SEVERAL blocks, each with a length, which is why it is a row of its own rather
 * than a channel: what it draws is bars one drags, not diamonds. Lanes stack, and two of them
 * play at once.
 */
export type LaneRow = {
  kind: 'lane'
  id: string
  name: string
  height: number
  nodeId: string
  laneId: string
  /** The last lane of its object offers to add one after it, and it alone: adding is one action. */
  last: boolean
  blocks: readonly ClipBlock[]
}

/** One shot on the band, with the name of the camera it puts on air. */
export type ShotBar = {
  shot: CameraShot
  name: string
}

export type AnimationRow = SubjectRow | ChannelRow | LaneRow

/**
 * Row heights, in pixels, and they are DERIVED from what the header column must hold rather
 * than chosen: a name on one line, then a row of `--sc-control` buttons under it, plus padding.
 *
 * This is the arithmetic the old panel got wrong in the other direction — it laid six buttons
 * BESIDE a name in a 140 px column, leaving the name zero pixels wide. A height that cannot
 * hold its own controls is the same defect turned ninety degrees.
 *
 * Fixed rather than read from the density gauge because the canvas cannot read a CSS variable;
 * both densities (24 px and 28 px controls) fit inside these.
 */
const CONTROL_ROW = 28
const NAME_ROW = 16

export const SUBJECT_HEIGHT = NAME_ROW + CONTROL_ROW + ROW_PADDING

/** A channel shows a name and one button, side by side — so one control row is enough. */
export const CHANNEL_HEIGHT = CONTROL_ROW + ROW_PADDING

/**
 * Which subject a track belongs to. A bone is addressed by name because it lives inside the
 * file, so the pair is what identifies a line — see `TrackTarget`.
 */
export function subjectKey(subject: Subject): string {
  return subject.bone ? `${subject.nodeId}/${subject.bone}` : subject.nodeId
}

/** Every instant any of these tracks holds a key at, once each, in order. */
export function mergedKeys(tracks: readonly AnimationTrack[]): Us[] {
  const times = new Set<Us>()
  for (const track of tracks) {
    for (const key of track.keys) times.add(key.time)
  }
  return [...times].sort((left, right) => left - right)
}

/** A model playing a clip, as the document holds it and the engine measured it. */

export type ClipBlock = {
  clipId: string
  name: string
  start: Us
  /** How long the block runs on the band, at the speed it plays. */
  duration: Us
}

/** One lane of one model, as the panel hands it over: the document's own lanes, measured. */
