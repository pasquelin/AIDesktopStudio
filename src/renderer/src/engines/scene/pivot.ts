/**
 * Moving several nodes with one gizmo.
 *
 * `TransformControls` attaches a single `Object3D`, so a selection of several is briefly parented
 * to a pivot placed at its centre. `Object3D.attach` preserves world transforms in both
 * directions — which is what turns one gesture into the right move for every node, without a
 * delta derived by hand and without the drift that deriving one accumulates over a drag.
 *
 * None of this needs a WebGL context: it is object maths, and it is tested as such.
 */
import { Vector3, type Object3D } from 'three'
import type { Transform } from '@shared/domain/scene'
import type { NodeMove } from './sceneState'

const corner = new Vector3()

/** The average of where the objects stand, in world space, written into `out`. */
export function centreOf(objects: readonly Object3D[], out: Vector3): Vector3 {
  out.set(0, 0, 0)
  if (objects.length === 0) return out

  for (const object of objects) out.add(object.getWorldPosition(corner))
  return out.divideScalar(objects.length)
}

/**
 * Puts the pivot at the centre of the selection, and turns it the way the frame asks.
 *
 * Square with the world by default, so a rotation turns the group around its own centre rather
 * than around whatever the last drag left it pointing at. In the local frame it takes the
 * anchor's orientation — the last node picked — which is what Blender does with the active
 * object, and without which the toggle would light up while changing nothing.
 */
export function placePivot(pivot: Object3D, objects: readonly Object3D[], anchor?: Object3D): void {
  centreOf(objects, pivot.position)
  if (anchor) anchor.getWorldQuaternion(pivot.quaternion)
  else pivot.rotation.set(0, 0, 0)
  pivot.scale.set(1, 1, 1)
  pivot.updateMatrixWorld()
}

/** The drag starts: the selection rides the pivot until it ends. */
export function carry(pivot: Object3D, objects: readonly Object3D[], scene: Object3D): void {
  // `attach` reads world matrices, and nothing has rendered since the pivot was placed.
  scene.updateMatrixWorld()
  for (const object of objects) pivot.attach(object)
}

/**
 * Hands the selection back to where each node belongs and reads where it ended up, or `null` if
 * the pivot was carrying nothing.
 *
 * What is carried is read off the pivot rather than off a list kept beside it: a node deleted
 * mid-drag would leave that list holding an object the scene must never be handed back.
 */
export function release(
  pivot: Object3D,
  scene: Object3D,
  parentOf: (id: string) => Object3D = () => scene,
): NodeMove[] | null {
  const carried = [...pivot.children]
  if (carried.length === 0) return null

  scene.updateMatrixWorld()
  return carried.map(object => {
    // Back under the node's own parent, not under the scene: what is read next is a *local*
    // transform, and reading it in the scene's frame would write a group's own placement into
    // its child — applied twice on the next sync.
    parentOf(object.name).attach(object)
    return { id: object.name, transform: transformOf(object) }
  })
}

export function transformOf(object: Object3D): Transform {
  return {
    position: { x: object.position.x, y: object.position.y, z: object.position.z },
    rotation: { x: object.rotation.x, y: object.rotation.y, z: object.rotation.z },
    scale: { x: object.scale.x, y: object.scale.y, z: object.scale.z },
  }
}

/** Whether the object already stands exactly there — `applyTransform` writes these three verbatim. */
export function standsAt(object: Object3D, transform: Transform): boolean {
  const { position, rotation, scale } = transform
  return (
    object.position.x === position.x &&
    object.position.y === position.y &&
    object.position.z === position.z &&
    object.rotation.x === rotation.x &&
    object.rotation.y === rotation.y &&
    object.rotation.z === rotation.z &&
    object.scale.x === scale.x &&
    object.scale.y === scale.y &&
    object.scale.z === scale.z
  )
}

/** The other way round: a transform written into an object. Three sites had it copied out. */
export function applyTransform(object: Object3D, transform: Transform): void {
  const { position, rotation, scale } = transform
  object.position.set(position.x, position.y, position.z)
  object.rotation.set(rotation.x, rotation.y, rotation.z)
  object.scale.set(scale.x, scale.y, scale.z)
}
