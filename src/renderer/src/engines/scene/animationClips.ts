import {
  AnimationClip,
  Euler,
  Quaternion,
  QuaternionKeyframeTrack,
  VectorKeyframeTrack,
  type KeyframeTrack,
  type Object3D,
} from 'three'
import { SECOND, type Us } from '@shared/domain/time'
import type { Transform } from '@shared/domain/scene'
import type { AnimationTimeline, AnimationTrack } from '@shared/domain/animation'

/**
 * What the scene's own animation is called inside an exported glTF — the name Blender and every
 * other reader shows in its action list. It is the studio's, so it carries the studio's name.
 */
const STUDIO_CLIP_NAME = 'AI Desktop Studio'
import { poseAt, tracksFor } from './animationEval'

/** A node the file will hold, and the poses its tracks are measured against. */
export type ClipTarget = {
  nodeId: string
  /** The object the FILE holds — a copy, since that is what the exporter walks. */
  object: Object3D
  /**
   * What this channel rests at: the node's own transform, or — for a bone — the pose the FILE
   * gave it, which is where the document holds nothing. Baking a bone against the node's rest
   * would move the whole rig by the node's own placement.
   */
  restOf: (bone?: string) => Transform | null
}

const seconds = (time: Us): number => time / SECOND

/**
 * Which object a track writes on: the node itself, or the bone of its model that wears the name.
 *
 * `null` for a bone no longer in the model — a rig replaced under a timeline that still names its
 * old joints. Dropping that channel is what keeps the export from failing over it.
 */
function drivenObject(target: ClipTarget, bone?: string): Object3D | null {
  return bone ? (target.object.getObjectByName(bone) ?? null) : target.object
}

/**
 * Every instant this channel has to be sampled at: the keys of every track driving it, and
 * nothing else. The ends of the timeline are NOT added — a value holds before the first key and
 * after the last one, so sampling them again writes a frame no reader needs.
 */
function samplesOf(tracks: readonly AnimationTrack[]): Us[] {
  const times = new Set<Us>()
  for (const track of tracks) for (const key of track.keys) times.add(key.time)

  return [...times].sort((a, b) => a - b)
}

const same = (values: readonly number[], stride: number): boolean =>
  values.every((value, index) => value === values[index % stride])

/**
 * One channel of one object, or `null` when the value never changes: a file full of tracks
 * repeating a single value is noise every reader has to walk past.
 */
function trackOf(
  name: string,
  times: readonly number[],
  values: number[],
  stride: number,
): KeyframeTrack | null {
  if (same(values, stride)) return null

  return stride === 4
    ? new QuaternionKeyframeTrack(name, times, values)
    : new VectorKeyframeTrack(name, times, values)
}

/**
 * The studio's timeline as a clip a glTF can carry — the RESULT, never the tools that made it.
 *
 * A track here holds a delta over a rest pose and several of them add up, while glTF holds one
 * absolute value per node per channel. Baking at every key is what bridges the two, and it is
 * what §7 of the plan asks for: a reader that knows nothing of this studio still sees the
 * movement. What produced it — a rail, a constraint — belongs to an extension, not here.
 *
 * `null` when nothing plays: an empty clip would be a file claiming an animation it does not have.
 */
export function timelineClip(
  timeline: AnimationTimeline,
  targets: readonly ClipTarget[],
): AnimationClip | null {
  const tracks: KeyframeTrack[] = []
  const euler = new Euler()
  const turn = new Quaternion()

  for (const target of targets) {
    for (const bone of bonesOf(timeline, target.nodeId)) {
      // Every key is a sample, muted and soloed-out ones included: `poseAt` already refuses to
      // play them, so their pose comes back constant and the channel is dropped below. One rule
      // decides what plays, and it is the one the viewport obeys.
      const channel = tracksFor(timeline, target.nodeId, bone)
      const object = drivenObject(target, bone)
      const rest = target.restOf(bone)
      if (channel.length === 0 || !object || !rest) continue

      const at = samplesOf(channel)
      const times = at.map(seconds)
      const poses = at.map(time => poseAt(rest, timeline, target.nodeId, time, bone))

      const positions = poses.flatMap(pose => [pose.position.x, pose.position.y, pose.position.z])
      const scales = poses.flatMap(pose => [pose.scale.x, pose.scale.y, pose.scale.z])
      const turns = poses.flatMap(pose => {
        euler.set(pose.rotation.x, pose.rotation.y, pose.rotation.z)
        turn.setFromEuler(euler)
        return [turn.x, turn.y, turn.z, turn.w]
      })

      const channels: readonly [string, number[], number][] = [
        [`${object.uuid}.position`, positions, 3],
        [`${object.uuid}.quaternion`, turns, 4],
        [`${object.uuid}.scale`, scales, 3],
      ]

      for (const [channelName, values, stride] of channels) {
        const made = trackOf(channelName, times, values, stride)
        if (made) tracks.push(made)
      }
    }
  }

  return tracks.length === 0
    ? null
    : new AnimationClip(STUDIO_CLIP_NAME, seconds(timeline.duration), tracks)
}

/** Which channels a node has: itself, plus one per bone any track names. */
function bonesOf(timeline: AnimationTimeline, nodeId: string): (string | undefined)[] {
  const bones = new Set<string | undefined>([undefined])
  for (const track of timeline.tracks) {
    if (track.target.nodeId === nodeId && track.target.bone) bones.add(track.target.bone)
  }

  return [...bones]
}
