// SPDX-License-Identifier: MIT

import type { ScenePlay } from '@shared/domain/scene'
import type { Vector3 } from '@shared/domain/transform'
import { clamp } from '../numeric'
import { copyAxes } from './entity'
import { axesOfEuler, type Axes } from '../physics/quaternion'
import type { CameraView } from '../ports/renderPort'

/** Where the head is pointed, in radians. Yaw turns, pitch tips. */
export type Look = { yaw: number; pitch: number }

/**
 * How far behind the shoulder the camera hangs, and how high a plan view stands and stands off.
 * A SHOULDER: what is driven asks for its own stand-off, a nine-metre plane being inside this one.
 */
export const OVER_SHOULDER = 5
const OVERHEAD_HEIGHT = 12
const OVERHEAD_BACK = 4

/**
 * Where the scene is watched from. `feet` is the contact with the floor, never the centre.
 *
 * 🛑 Nothing for `orbit` nor for a mode this does not know — a fifth `PlayCamera` leaves the
 * camera alone rather than silently behaving like a third-person one. The view is reused.
 */
export function playView(
  play: ScenePlay,
  feet: Vector3,
  look: Look,
  back = OVER_SHOULDER,
): CameraView | null {
  if (play.camera === 'orbit') return null

  // The one VIEW serves every shot: an arm's lens left here would stick to a third-person one.
  VIEW.fieldOfView = undefined
  VIEW.target.x = feet.x
  VIEW.target.y = feet.y + play.eyeHeight
  VIEW.target.z = feet.z

  if (play.camera === 'topDown') {
    VIEW.position.x = feet.x
    VIEW.position.y = feet.y + OVERHEAD_HEIGHT
    VIEW.position.z = feet.z + OVERHEAD_BACK
    return VIEW
  }

  aheadOf(look, AHEAD)

  if (play.camera === 'firstPerson') {
    copyAxes(VIEW.position, VIEW.target)
    VIEW.target.x += AHEAD.x
    VIEW.target.y += AHEAD.y
    VIEW.target.z += AHEAD.z
    return VIEW
  }

  if (play.camera === 'thirdPerson') {
    VIEW.position.x = VIEW.target.x - AHEAD.x * back
    VIEW.position.y = VIEW.target.y - AHEAD.y * back
    VIEW.position.z = VIEW.target.z - AHEAD.z * back
    return VIEW
  }

  return null
}

/** The way a look POINTS, as a unit vector. Written in place, and read once a frame per shot. */
export function aheadOf(look: Look, into: Vector3): Vector3 {
  const flat = Math.cos(look.pitch)
  into.x = -Math.sin(look.yaw) * flat
  into.y = Math.sin(look.pitch)
  into.z = -Math.cos(look.yaw) * flat
  return into
}

/**
 * The shot a camera NODE makes: it stands where it stands and looks where it is turned. What a
 * spring arm composes, rather than a stand-off from a pair of feet.
 *
 * 🛑 An orbited set is left alone here too — the one mode where the game does not drive the view.
 */
export function armView(
  play: ScenePlay,
  at: Vector3,
  rotation: Vector3,
  axes: Axes,
  fieldOfView?: number,
): CameraView | null {
  if (play.camera === 'orbit') return null

  const { forward } = axesOfEuler(rotation, axes)
  VIEW.fieldOfView = fieldOfView
  copyAxes(VIEW.position, at)
  VIEW.target.x = at.x + forward.x
  VIEW.target.y = at.y + forward.y
  VIEW.target.z = at.z + forward.z
  return VIEW
}

/** Where a rotation POINTS, as the yaw and pitch a shot is built from. */
export function lookOf(rotation: Vector3, axes: Axes, into: Look): Look {
  const { forward } = axesOfEuler(rotation, axes)
  into.yaw = Math.atan2(-forward.x, -forward.z)
  into.pitch = Math.asin(clamp(forward.y, -1, 1))
  return into
}

const VIEW: CameraView = { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 } }
const AHEAD: Vector3 = { x: 0, y: 0, z: 0 }
