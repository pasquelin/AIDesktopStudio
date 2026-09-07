/**
 * What a clip does to the body's ROOT: the ground it covers, how high it rides, which way it
 * faces. Root motion is taken OUT of the pose and carried by the group instead — left in, the hips
 * slide a stride ahead of the feet the moment the walker is also driven along a path of their own.
 *
 * 🛑 Read off the SOURCE file, never off the retargeted clip. `retargetClip` gives the hip a
 * treatment of its own — measured 2026-09-06 on the shipped clips, the adapted channel answered
 * 149 m of travel for a side step and 297° of turn for a straight walk.
 */
import {
  AnimationClip,
  Matrix4,
  PropertyBinding,
  Quaternion,
  QuaternionKeyframeTrack,
  Vector3,
  type KeyframeTrack,
  type Object3D,
} from 'three'
import { shortWay } from '@game/numeric'
import { clamp } from '@shared/numeric'
import type { WelcomeStep } from './welcomeWalk'

export type WelcomeRootMotion = {
  /** Where the root stands on the ground plane at that instant, in metres. */
  travelAt: (time: number) => { x: number; z: number }
  /** How high it rides — the walk's bounce, and the whole arc of a jump. */
  heightAt: (time: number) => number
  /** How far it has turned since the clip began, in radians about Y. */
  turnAt: (time: number) => number
}

/** A clip that drives nothing: what a file with no root track answers, rather than a throw. */
const STILL: WelcomeRootMotion = {
  travelAt: () => ({ x: 0, z: 0 }),
  heightAt: () => 0,
  turnAt: () => 0,
}

/**
 * The root's path through the world, at the character's own size. `scale` is how much shorter the
 * character is than the body the clip was authored on — a stride belongs to a leg, so a walk
 * replayed on a smaller one covers proportionally less ground.
 */
export function welcomeRootMotion(
  clip: AnimationClip,
  root: Object3D,
  scale: number,
): WelcomeRootMotion {
  const moved = clip.tracks.find(one => one.name === `${root.name}.position`)
  if (!moved) return STILL

  // The frame the tracks are written in: everything ABOVE the root — the armature's quarter turn
  // and its centimetres.
  root.updateWorldMatrix(true, false)
  const frame = new Matrix4().copy(root.parent?.matrixWorld ?? new Matrix4())
  // The DURATION and never the clip: these three closures live for the session, and one holding
  // the clip pins all of its tracks — 1 248 of them across the shipped set, for one number.
  const duration = clip.duration
  const clamped = (time: number): number => clamp(time, 0, duration)
  const along = moved.InterpolantFactoryMethodLinear()
  const held = new Vector3()
  const at = (time: number): Vector3 => {
    const value = along.evaluate(clamped(time))
    return held
      .set(value[0] ?? 0, value[1] ?? 0, value[2] ?? 0)
      .applyMatrix4(frame)
      .multiplyScalar(scale)
  }

  return {
    travelAt: time => {
      const point = at(time)

      return { x: point.x, z: point.z }
    },
    heightAt: time => at(time).y,
    turnAt: yawOf(
      clip.tracks.find(one => one.name === `${root.name}.quaternion`),
      frame,
      clamped,
      duration,
    ),
  }
}

/**
 * Radians of net yaw under which a clip is walking straight. A hip swings through every stride,
 * and the shipped walks measure ±10° of it against a turn's 88° to 180°.
 */
const SWAY = 0.55

/**
 * The yaw the clip turns THROUGH, spread evenly across its length. 🛑 Never the INSTANT yaw: a
 * hip's own swing then steered the travel a dozen degrees each way, frame by frame, and the walker
 * slid sideways down the plate while its feet went straight.
 */
function yawOf(
  track: KeyframeTrack | undefined,
  frame: Matrix4,
  clamped: (time: number) => number,
  duration: number,
): (time: number) => number {
  if (!track || duration <= 0) return () => 0

  // DECOMPOSED, never `setFromRotationMatrix`: this frame carries the armature's centimetres, and
  // that method reads a scaled matrix as a rotation — a quarter turn came back as 21°.
  const turn = new Quaternion()
  frame.decompose(new Vector3(), turn, new Vector3())
  const along = track.InterpolantFactoryMethodLinear()
  const held = new Quaternion()
  const facing = new Vector3()
  const at = (time: number): number => {
    const value = along.evaluate(clamped(time))
    held.set(value[0] ?? 0, value[1] ?? 0, value[2] ?? 0, value[3] ?? 1).premultiply(turn)
    facing.set(0, 0, 1).applyQuaternion(held)
    return Math.atan2(facing.x, facing.z)
  }

  const net = shortWay(at(0), at(duration))
  if (Math.abs(net) < SWAY) return () => 0

  return time => (net * clamped(time)) / duration
}

/** Where a character's root rides at rest, and how its strides compare to the clip's own body. */
export type WelcomeRootFit = {
  /** The target's resting height, in metres — what a clip's height is an offset FROM. */
  rest: number
  /** How much shorter the target rides: a stride belongs to a leg, so a smaller one covers less. */
  scale: number
}

/**
 * Both roots read in WORLD units with their own frames applied, which is the only comparison the
 * two files can be held to: one is authored in metres and the other in centimetres.
 */
export function welcomeRootFit(target: Object3D, source: Object3D): WelcomeRootFit {
  const height = (root: Object3D): number => {
    root.updateWorldMatrix(true, false)
    return new Vector3().setFromMatrixPosition(root.matrixWorld).y
  }

  const rest = height(target)
  const from = height(source)

  // Never zero and never inverted: a rig whose root sits on the floor would otherwise scale every
  // stride to nothing, and the walker would run on the spot.
  return { rest, scale: from > 0.01 ? rest / from : 1 }
}

/**
 * What a root covers over `seconds`, the clip's own loop included rather than lost. 🛑 A clip held
 * on its last frame pushes NOTHING: read as a window past its end it answered the whole clip AGAIN,
 * growing with every frame of the fade, and the walker was thrown forward at each change of gait.
 */
export function welcomeStepOver(
  root: WelcomeRootMotion,
  duration: number,
  from: number,
  seconds: number,
): WelcomeStep {
  if (from >= duration) return { x: 0, z: 0, turned: 0 }

  const to = from + seconds
  if (to <= duration) return between(root, from, to)

  const tail = between(root, from, duration)
  const head = between(root, 0, Math.min(to - duration, duration))

  return { x: tail.x + head.x, z: tail.z + head.z, turned: tail.turned + head.turned }
}

function between(root: WelcomeRootMotion, from: number, to: number): WelcomeStep {
  const start = root.travelAt(from)
  const end = root.travelAt(to)

  return {
    x: end.x - start.x,
    z: end.z - start.z,
    turned: root.turnAt(to) - root.turnAt(from),
  }
}

/**
 * Pose tracks with the root's travel dropped and its PATH yaw taken off the quaternion. The group
 * owns heading; the bone keeps roll, pitch, and the stride's own hip sway.
 */
export function welcomeRootHeld(
  clip: AnimationClip,
  root: Object3D,
  positionTrack: string,
  turnAt: (time: number) => number,
): AnimationClip {
  const spun = `${PropertyBinding.parseTrackName(positionTrack).nodeName}.quaternion`
  root.updateWorldMatrix(true, false)
  const turn = new Quaternion()
  const frame = new Matrix4().copy(root.parent?.matrixWorld ?? new Matrix4())
  frame.decompose(new Vector3(), turn, new Vector3())

  return new AnimationClip(
    clip.name,
    clip.duration,
    clip.tracks.flatMap(track => {
      if (track.name === positionTrack) return []
      if (track.name !== spun) return [track]

      return [heldSpin(track, turn, turnAt)]
    }),
  )
}

const Y_AXIS = new Vector3(0, 1, 0)

function heldSpin(
  track: KeyframeTrack,
  frame: Quaternion,
  turnAt: (time: number) => number,
): QuaternionKeyframeTrack {
  const inverse = frame.clone().invert()
  const values = new Float32Array(track.values.length)
  const local = new Quaternion()
  const world = new Quaternion()
  const yaw = new Quaternion()

  for (let index = 0; index < track.times.length; index += 1) {
    local.fromArray(track.values, index * 4)
    world.copy(frame).multiply(local)
    yaw.setFromAxisAngle(Y_AXIS, -turnAt(track.times[index] ?? 0))
    world.premultiply(yaw)
    local.copy(inverse).multiply(world)
    local.toArray(values, index * 4)
  }

  return new QuaternionKeyframeTrack(track.name, Array.from(track.times), values)
}
