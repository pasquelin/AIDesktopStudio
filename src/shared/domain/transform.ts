/**
 * Where something stands, and how it is read back off a file.
 *
 * Apart from `scene.ts`, which re-exports it, for one reason only: a rig holds a rest pose per
 * bone, and `rig.ts` needing this while `scene.ts` needs a `Rig` would close an import cycle —
 * one `import-cycles.test.ts` holds at zero and that neither the compiler nor eslint would see.
 */
import { isRecord } from '../guards'

export type Vector3 = { x: number; y: number; z: number }

export type Transform = {
  position: Vector3
  /** Euler angles, in radians. */
  rotation: Vector3
  scale: Vector3
}

/** Standing at the origin, unturned, unscaled — what a rest pose and a fresh node both start at. */
export const IDENTITY_TRANSFORM: Transform = {
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
}

/** The three parts of a transform, for a walk that must not forget one. */
const PARTS: readonly (keyof Transform)[] = ['position', 'rotation', 'scale']

/**
 * The parts of a transform that have MOVED, the ones still at rest left out.
 *
 * 🛑 For what crosses to a model, where every character is one the rest of the answer does not
 * get: a node merely moved carried its unturned rotation and its unscaled scale for 78 characters,
 * in the one member of `scene.state` that was being dropped whole for want of room.
 */
export function movedParts(transform: Transform): Partial<Transform> {
  const moved: Partial<Transform> = {}
  for (const part of PARTS) {
    const rest = IDENTITY_TRANSFORM[part]
    const value = transform[part]
    if (!sameVector3(value, rest)) moved[part] = value
  }
  return moved
}

/** Whether two points stand at the same place. Written out at four sites before it lived here. */
export const sameVector3 = (one: Vector3, other: Vector3): boolean =>
  one.x === other.x && one.y === other.y && one.z === other.z

/**
 * Where the eye stands and what it looks at, in the scene's own frame. `fieldOfView`, in degrees,
 * is the lens of the camera node a shot goes through; absent, the drawer keeps the viewport's own.
 */
export type CameraView = { position: Vector3; target: Vector3; fieldOfView?: number }

/** A view nothing has filmed yet: NaN never equals a real coordinate, so the first view always lands. */
export const NOWHERE: Vector3 = { x: Number.NaN, y: Number.NaN, z: Number.NaN }

/** Both engines drop a view that has not moved — `placeView` and `draw` each ask for a frame. */
export function sameCameraView(one: CameraView, other: CameraView): boolean {
  return (
    sameVector3(one.position, other.position) &&
    sameVector3(one.target, other.target) &&
    one.fieldOfView === other.fieldOfView
  )
}

/** Written in place: a view is kept once a frame, and a fresh pair of vectors per frame is not. */
export function copyCameraView(into: CameraView, from: CameraView): void {
  into.position.x = from.position.x
  into.position.y = from.position.y
  into.position.z = from.position.z
  into.target.x = from.target.x
  into.target.y = from.target.y
  into.target.z = from.target.z
  into.fieldOfView = from.fieldOfView
}

/** Whether two poses are the same one. Read per entity per frame — no allocation on the way. */
export function sameTransform(one: Transform, other: Transform): boolean {
  return (
    one.position.x === other.position.x &&
    one.position.y === other.position.y &&
    one.position.z === other.position.z &&
    one.rotation.x === other.rotation.x &&
    one.rotation.y === other.rotation.y &&
    one.rotation.z === other.rotation.z &&
    one.scale.x === other.scale.x &&
    one.scale.y === other.scale.y &&
    one.scale.z === other.scale.z
  )
}

/** A transform nothing else holds a reference into — what a runtime copies out of a document. */
export function copyTransform(transform: Transform): Transform {
  return {
    position: { ...transform.position },
    rotation: { ...transform.rotation },
    scale: { ...transform.scale },
  }
}

export function isVector3(value: unknown): value is Vector3 {
  if (!isRecord(value)) return false
  return ['x', 'y', 'z'].every(axis => typeof value[axis] === 'number')
}

export function isTransform(value: unknown): value is Transform {
  if (!isRecord(value)) return false
  return isVector3(value.position) && isVector3(value.rotation) && isVector3(value.scale)
}

export function finiteTransform(transform: Transform): boolean {
  return [transform.position, transform.rotation, transform.scale].every(vector =>
    [vector.x, vector.y, vector.z].every(Number.isFinite),
  )
}
