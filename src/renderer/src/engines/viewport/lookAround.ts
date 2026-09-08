import type { Object3D } from 'three'
import {
  clampElevation,
  directionFromAngles,
  normalizeAzimuth,
  type SphericalAngles,
} from '@shared/domain/angles'

/**
 * Turning the head in place, for a camera sitting at the centre of what it looks at.
 *
 * `OrbitControls` is not used here on purpose: it orbits *around* a target, and pinning it at
 * the centre means locking its distance to nearly zero, which costs the rotation its precision
 * and still leaves the direction of the drag inverted. Two angles and a clamp are shorter than
 * the workaround, and they make the field of view and the inversion fall out for free.
 */

/** Radians turned per pixel dragged. Tuned so a full turn takes roughly a screen width. */
const LOOK_SENSITIVITY = 0.005

export const DEFAULT_LOOK: SphericalAngles = { elevation: 0, azimuth: 0 }

/**
 * Where a drag leaves the view. Dragging right turns the view left — the image follows the
 * hand, as grabbing the world implies, which is the opposite of moving a camera.
 */
export function turnBy(
  angles: SphericalAngles,
  deltaX: number,
  deltaY: number,
  sensitivity: number = LOOK_SENSITIVITY,
): SphericalAngles {
  return {
    azimuth: normalizeAzimuth(angles.azimuth + deltaX * sensitivity),
    elevation: clampElevation(angles.elevation + deltaY * sensitivity),
  }
}

/**
 * Aims a camera along the angles, from wherever it stands. The offset from its own position is
 * what makes this a HEADING rather than a target: `lookAt` takes a point, never a direction.
 */
export function aimAlong(camera: Object3D, angles: SphericalAngles): void {
  const { x, y, z } = directionFromAngles(angles)
  camera.lookAt(camera.position.x + x, camera.position.y + y, camera.position.z + z)
}
