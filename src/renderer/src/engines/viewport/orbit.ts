import { Quaternion, Vector3 } from 'three'
import { clamp } from '@shared/numeric'
import { clampElevation } from '@shared/domain/angles'

/**
 * Turntable orbit around an arbitrary pivot — what Blender, Unity, Unreal and Maya all turn by.
 *
 * `OrbitControls` cannot do this: `update()` ends on `lookAt(target)`, so its pivot is forced onto
 * the line of sight, and one put under the pointer would swing the view round to centre it. Here
 * the camera is rotated as a RIGID BODY about the pivot — position AND orientation by the same
 * rotation — which is what leaves whatever the pivot sits on at the pixel it was on.
 */

/** A full turn per viewport height dragged. `OrbitControls` gives the same, and so does Blender. */
export const ORBIT_TURN_PER_HEIGHT = Math.PI * 2

export type OrbitRequest = {
  position: Vector3
  quaternion: Quaternion
  pivot: Vector3
  deltaX: number
  deltaY: number
  /** Height of the PANE in pixels, so the turn per drag is the same at every resolution. */
  height: number
}

export type OrbitMove = {
  position: Vector3
  quaternion: Quaternion
}

const WORLD_UP = new Vector3(0, 1, 0)

export function orbitAround({
  position,
  quaternion,
  pivot,
  deltaX,
  deltaY,
  height,
}: OrbitRequest): OrbitMove {
  const turn = height > 0 ? ORBIT_TURN_PER_HEIGHT / height : 0

  // The GAZE is clamped, not the offset to the pivot: the two agree only while the camera looks
  // straight at it, and zooming towards the pointer is what takes it off that line.
  const gaze = new Vector3(0, 0, -1).applyQuaternion(quaternion)
  const elevation = Math.asin(clamp(gaze.y, -1, 1))
  const pitch = clampElevation(elevation - deltaY * turn) - elevation

  // Pitch about the camera's own right, yaw about the world's up: that pair is what a turntable
  // is, and what keeps the horizon level whatever the drag — no rotation ever has a roll term.
  const right = new Vector3(1, 0, 0).applyQuaternion(quaternion)
  const rotation = new Quaternion()
    .setFromAxisAngle(WORLD_UP, -deltaX * turn)
    .multiply(new Quaternion().setFromAxisAngle(right, pitch))

  return {
    position: position.clone().sub(pivot).applyQuaternion(rotation).add(pivot),
    quaternion: rotation.clone().multiply(quaternion),
  }
}
