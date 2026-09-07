import {
  type AnimationTimeline,
  type CameraMotion,
  type CameraShot,
} from '@shared/domain/animation'
import type { Us } from '@shared/domain/time'
import { type Command } from '../core/history'
import { shotsWith } from './cameraShots'
import { addNode, multi } from './commands'
import { pathNode } from './nodeFactory'
import { type CameraNode, type SceneState } from './sceneState'

const writeShots = (
  state: SceneState,
  change: (shots: readonly CameraShot[]) => readonly CameraShot[],
): SceneState => ({
  ...state,
  animation: { ...state.animation, shots: change(state.animation.shots) },
})

export function addCameraShot(shot: CameraShot): Command<SceneState> {
  return {
    id: `shot:add:${shot.id}`,
    apply: state => writeShots(state, shots => shotsWith(shots, shot)),
    revert: state => writeShots(state, shots => shots.filter(held => held.id !== shot.id)),
  }
}

export function removeCameraShot(shotId: string): Command<SceneState> {
  let before: { position: number; shot: CameraShot } | null = null

  return {
    id: `shot:remove:${shotId}`,
    apply: state => {
      const position = state.animation.shots.findIndex(shot => shot.id === shotId)
      const shot = state.animation.shots[position]
      if (!shot) return state

      before = { position, shot }
      return writeShots(state, shots => shots.filter(held => held.id !== shotId))
    },
    revert: state => {
      const origin = before
      if (!origin) return state
      // Put back where it stood: two shots of one line starting together are settled by their
      // order, so a shot restored at the end would come back on top of what it was under.
      return writeShots(state, shots => {
        const restored = [...shots]
        restored.splice(origin.position, 0, origin.shot)
        return restored
      })
    },
  }
}

/**
 * A shot moved, trimmed, aimed or set on a rail — one command for all of them, because each is
 * the same shot with other fields. Whichever fields are given are the ones written.
 */
export function editCameraShot(
  shotId: string,
  changes: Partial<Omit<CameraShot, 'id' | 'cameraId'>>,
): Command<SceneState> {
  let previous: CameraShot | null = null

  return {
    id: `shot:edit:${shotId}`,
    apply: state => {
      previous = state.animation.shots.find(shot => shot.id === shotId) ?? null
      return previous === null
        ? state
        : writeShots(state, shots =>
            shots.map(shot => (shot.id === shotId ? { ...shot, ...changes } : shot)),
          )
    },
    revert: state => {
      const origin = previous
      return origin === null
        ? state
        : writeShots(state, shots => shots.map(shot => (shot.id === shotId ? origin : shot)))
    },
  }
}

/**
 * One camera's line moved up or down the stack, which is what dragging its grip does.
 *
 * An edit of the DOCUMENT, unlike the sheet's own arrangement: this order is the law an overlap
 * is settled by, so moving a line changes what the film looks through.
 *
 * The whole list arrives written rather than a number of notches, and `coalesce` is why: a drag
 * merges into ONE entry that keeps the LAST apply, so a step would replay a three-notch gesture
 * as one. `cameraId` names the line only so two drags of two lines stay two entries.
 */
export function reorderCameraShots(
  cameraId: string,
  shots: readonly CameraShot[],
): Command<SceneState> {
  let previous: readonly CameraShot[] | null = null

  return {
    id: `shot:camera:${cameraId}`,
    apply: state => {
      previous = state.animation.shots
      return writeShots(state, () => shots)
    },
    revert: state => {
      const origin = previous
      return origin === null ? state : writeShots(state, () => origin)
    },
  }
}

/** What a rail takes when it is first bound: the whole of it, forwards, at a steady speed. */
const WHOLE_RAIL: Omit<CameraMotion, 'pathId'> = { from: 0, to: 1, easing: 'linear' }

/**
 * A rail laid where a camera stands, aimed down its line of sight, and bound to its shot.
 *
 * One command for the two edits, so a single ⌘Z takes back the whole gesture rather than leaving
 * a rail nothing runs on.
 */
export function railForShot(camera: CameraNode, shot: CameraShot): Command<SceneState> {
  const rail = { ...pathNode(), transform: camera.transform }

  return multi(`shot:rail:${shot.id}`, [
    addNode(rail),
    editCameraShot(shot.id, { motion: { ...WHOLE_RAIL, pathId: rail.id } }),
  ])
}

/**
 * A rail on a camera the head covers no shot of: the shot is opened by the same gesture.
 *
 * A rail drives nothing without a shot to run it, so asking for one is asking for both — and
 * asking for both by hand meant finding a button in another panel first, with nothing saying so.
 */
export function railOnNewShot(camera: CameraNode, shot: CameraShot): Command<SceneState> {
  return multi(`shot:rail:new:${shot.id}`, [addCameraShot(shot), railForShot(camera, shot)])
}

/**
 * Another rail on a shot that already exists, or none at all. `changes` is what a caller who
 * knows the stretch it wants writes in the same breath — the panel names only the rail.
 */
export function bindRailToShot(
  shot: CameraShot,
  pathId: string,
  changes: Partial<Omit<CameraMotion, 'pathId'>> = {},
): Command<SceneState> {
  const motion: CameraMotion | undefined =
    pathId === '' ? undefined : { ...WHOLE_RAIL, ...shot.motion, ...changes, pathId }

  return editCameraShot(shot.id, { motion })
}

/**
 * Puts objects on the band, or takes them off it — the gesture that decides what is animated.
 *
 * `null` when it would change nothing, so a press on what is already there costs no undo. What
 * is taken off keeps its keys: a track still holds its line, by the rule in `animationRows`,
 * which is what stops a removal from hiding an animation.
 */
export function putOnAnimationSheet(
  state: SceneState,
  nodeIds: readonly string[],
): Command<SceneState> | null {
  // Sets on both sides: `includes` in a filter is quadratic, and putting a selection of a few
  // thousand on the band paid 61 ms for it, its undo as much again — measured 20/08.
  const held = new Set(state.animation.sheet)
  const added = [...new Set(nodeIds)].filter(id => !held.has(id))
  if (added.length === 0) return null

  const wanted = new Set(added)

  return {
    // Its LENGTH and its first, never the ids themselves: a whole selection joined made a 147 KiB
    // string, held for as long as the command sat in the undo stack, that nobody ever reads.
    id: `sheet:add:${added.length}:${added[0]}`,
    apply: current => writeSheet(current, [...current.animation.sheet, ...added]),
    revert: current =>
      writeSheet(
        current,
        current.animation.sheet.filter(id => !wanted.has(id)),
      ),
  }
}

/**
 * Takes objects off the band. Their keys stay — see `putOnAnimationSheet`.
 *
 * The whole selection in ONE command, never one per object: six taken off in a single gesture
 * have to come back in a single undo.
 */
export function takeOffAnimationSheet(
  state: SceneState,
  nodeIds: readonly string[],
): Command<SceneState> | null {
  // Captured with their places, so a revert puts them back WHERE they stood: a sheet somebody
  // arranged is not one to reshuffle. Through a `Set`, for the reason `putOnAnimationSheet` gives.
  const wanted = new Set(nodeIds)
  const taken = state.animation.sheet.flatMap((id, at) => (wanted.has(id) ? { id, at } : []))
  if (taken.length === 0) return null

  return {
    id: `sheet:remove:${taken.length}:${taken[0]?.id}`,
    apply: current =>
      writeSheet(
        current,
        current.animation.sheet.filter(id => !wanted.has(id)),
      ),
    revert: current => {
      const back = [...current.animation.sheet]
      // Ascending, so each insertion lands on a list that already holds everything before it.
      for (const one of taken) back.splice(one.at, 0, one.id)
      return writeSheet(current, back)
    },
  }
}

const writeSheet = (state: SceneState, sheet: readonly string[]): SceneState => ({
  ...state,
  animation: { ...state.animation, sheet },
})

/**
 * The whole band, put back to what a motion file carried.
 *
 * A command rather than a `replace`: reopening a motion throws away whatever the workbench held,
 * and one ⌘Z has to give it back — the band is an établi, not a drawer that swallows.
 */
export function loadAnimation(timeline: AnimationTimeline): Command<SceneState> {
  let previous: AnimationTimeline | null = null

  return {
    id: 'timeline:load',
    apply: state => {
      previous = state.animation
      return { ...state, animation: timeline }
    },
    revert: state => (previous === null ? state : { ...state, animation: previous }),
  }
}

/** How long the whole thing runs, and how finely it is cut. */
export function setTimelineSettings(
  settings: Partial<{ duration: Us; fps: number }>,
): Command<SceneState> {
  let previous: { duration: Us; fps: number } | null = null

  return {
    id: 'timeline:settings',
    apply: state => {
      previous = { duration: state.animation.duration, fps: state.animation.fps }
      return { ...state, animation: { ...state.animation, ...settings } }
    },
    revert: state => {
      const origin = previous
      return origin === null ? state : { ...state, animation: { ...state.animation, ...origin } }
    },
  }
}
