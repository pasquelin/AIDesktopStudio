import type { Quaternion } from 'three'
import { Vector3 } from 'three'
import { toRadians } from '@shared/domain/angles'

/**
 * Sliding the view sideways, pivot and all.
 *
 * The step is measured at the PIVOT'S depth, which is what makes a grabbed point stay under the
 * pointer rather than sliding away — the same arithmetic `OrbitControls` pans by, kept here
 * because the rotation it used to own has moved out and its `update()` no longer runs.
 */

export type PanRequest = {
  position: Vector3
  quaternion: Quaternion
  pivot: Vector3
  deltaX: number
  deltaY: number
  /** Height of the PANE in pixels. */
  height: number
  /** Vertical field of view in DEGREES, as a camera stores it. */
  fieldOfView: number
}

export type PanMove = {
  position: Vector3
  pivot: Vector3
}

export function panBy({
  position,
  quaternion,
  pivot,
  deltaX,
  deltaY,
  height,
  fieldOfView,
}: PanRequest): PanMove {
  const framed = 2 * position.distanceTo(pivot) * Math.tan(toRadians(fieldOfView) / 2)
  const perPixel = height > 0 ? framed / height : 0

  const step = new Vector3(1, 0, 0)
    .applyQuaternion(quaternion)
    .multiplyScalar(-deltaX * perPixel)
    .addScaledVector(new Vector3(0, 1, 0).applyQuaternion(quaternion), deltaY * perPixel)

  return { position: position.clone().add(step), pivot: pivot.clone().add(step) }
}
