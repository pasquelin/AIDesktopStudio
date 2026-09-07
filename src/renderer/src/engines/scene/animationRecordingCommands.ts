import { type AnimationTimeline, type AnimationTrack } from '@shared/domain/animation'
import type { Transform } from '@shared/domain/scene'
import type { Us } from '@shared/domain/time'
import { commandId, type Command } from '../core/history'
import { anySoloed, deltaOf, fovAt, playsThrough, valueAt } from './animationEval'
import { recordingTracksFor, setAnimationKey } from './animationTrackCommands'
import { moveNodes, multi, setCamera, setCameraOn } from './commands'
import type { FieldValue } from './propertyFields'
import { nodeById, type NodeMove, type SceneNode, type SceneState } from './sceneState'

export { recordingTracksFor } from './animationTrackCommands'

/**
 * Whether a gesture writes KEYS rather than the thing underneath.
 *
 * A subject ALREADY keyed records whatever the switch says: what a viewport shows is the rest
 * plus what the keys add, so writing underneath would move it by the value standing at that
 * instant. The switch only decides whether an UNKEYED subject starts being animated.
 */
function recordsKeys(tracks: readonly AnimationTrack[], recording: boolean): boolean {
  return tracks.length > 0 && (recording || tracks.some(track => track.keys.length > 0))
}

export function recordMove(
  rest: Transform,
  pose: Transform,
  time: Us,
  tracks: readonly AnimationTrack[],
): Command<SceneState>[] {
  return tracks.flatMap(track =>
    // A lens is not a pose: a drag says nothing about a field of view, and `deltaOf` would hand
    // this channel the rotation delta of the very same gesture.
    track.target.property === 'fov'
      ? []
      : setAnimationKey(track.id, time, deltaOf(rest, pose, track.target.property)),
  )
}

/**
 * What one gizmo drag becomes, over a whole selection: keys where auto-key is recording and a
 * channel exists, an ordinary move everywhere else.
 *
 * One command whatever the mix, so a drag over a keyed cube and a plain sphere is one undo.
 * `null` when there is nothing to write at all.
 */
export function movesToCommand(
  state: SceneState,
  moves: readonly NodeMove[],
  at: Us,
  recording: boolean,
): Command<SceneState> | null {
  const keys: Command<SceneState>[] = []
  const plain: NodeMove[] = []

  for (const move of moves) {
    const held = recordingTracksFor(state.animation, move.id, move.bone)
    const tracks = recordsKeys(held, recording) ? held : []
    const rest = move.rest ?? nodeById(state, move.id)?.transform

    if (tracks.length === 0 || !rest) {
      // A bone has nowhere else to go: it is not a node, so there is no plain move to fall back
      // on — an unrecorded bone drag is simply dropped, and the renderer puts it back.
      if (!move.bone) plain.push(move)
      continue
    }
    keys.push(...recordMove(rest, move.transform, at, tracks))
  }

  if (plain.length > 0) keys.push(moveNodes(plain))
  if (keys.length === 0) return null
  return keys.length === 1 && keys[0] ? keys[0] : multi('transform', keys)
}

/**
 * What a lens field typed into the inspector becomes: a key on the camera's `fov` channel where
 * one records, the descriptor itself everywhere else.
 *
 * Which fields can be keyed is a property of `TrackProperty`, asked here rather than by the
 * panel: `fov` is the only one today, and the day a second joins the union no view has to learn
 * about it. The number handed in is what the lens must READ at that instant.
 */
export function lensToCommand(
  timeline: AnimationTimeline,
  nodes: readonly SceneNode[],
  name: string,
  value: FieldValue,
  at: Us,
  recording: boolean,
): Command<SceneState> {
  if (name !== 'fov' || typeof value !== 'number') return setCameraOn(nodes, name, value)
  const soloed = anySoloed(timeline)

  // Composed rather than batched: which of the two an angle becomes depends on the channel under
  // it, and only one of them writes onto the node — see `batch`.
  return multi(
    commandId(
      'lens',
      nodes.map(node => node.id),
    ),
    nodes.flatMap(node => {
      if (node.type !== 'camera') return []

      // What the channels PLAY at that instant, which is what the field was showing. The same
      // filter has to pick what gets written: a key laid on a muted channel is a number typed and
      // lost, and a descriptor written under a locked one moves the lens twice.
      const played = fovAt(timeline, node.id, at) ?? 0
      const lenses = recordingTracksFor(timeline, node.id).filter(
        track => track.target.property === 'fov' && playsThrough(track, soloed),
      )
      const lens = lenses[0]
      if (!lens || !recordsKeys(lenses, recording)) {
        return setCamera(node.id, { ...node.camera, fov: value - played })
      }

      // This channel's own share taken back out: whatever else plays goes on adding what it adds,
      // so the key holds exactly what is left for the lens to READ the number typed.
      return setAnimationKey(lens.id, at, {
        x: value - node.camera.fov - (played - valueAt(lens, at).x),
        y: 0,
        z: 0,
      })
    }),
  )
}
