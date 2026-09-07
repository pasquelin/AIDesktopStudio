// SPDX-License-Identifier: MIT
import type { Transform, Vector3 } from '@shared/domain/transform'
import {
  eulerFromQuaternion,
  quaternionFromEuler,
  quaternionSlerp,
  type Quaternion,
} from '../physics/quaternion'
import type { EntityPlacement } from '../ports/renderPort'
import { clonedTransform, copyAxes, copyTransformInto, type Entity } from './entity'
import type { World } from './world'

/**
 * Every entity, drawn between the pose it held before the last step and the one it holds now.
 *
 * 🛑 Transforms of its OWN, never the entity's: a frame sits between two steps and is at neither
 * of them, so handing the live object over judders on every frame the accumulator runs no step.
 */
export function placementsOf(
  world: World,
  into: EntityPlacement[],
  alpha: number,
): readonly EntityPlacement[] {
  let count = 0
  for (const entity of world.entities.all()) {
    let placement = into[count]
    if (!placement) {
      placement = { entity: entity.id, transform: clonedTransform(entity.transform) }
      into.push(placement)
    }

    placement.entity = entity.id
    poseAt(entity, alpha, placement.transform)
    count += 1
  }

  into.length = count
  return into
}

/** Where an entity stands for THIS frame. Its own pose until a step has given it one to come from. */
export function poseAt(entity: Entity, alpha: number, into: Transform): Transform {
  const from = entity.previous
  if (!from) {
    copyTransformInto(into, entity.transform)
    return into
  }

  const to = entity.transform
  lerpAxes(into.position, from.position, to.position, alpha)
  turnBetween(from.rotation, to.rotation, alpha, into.rotation)
  lerpAxes(into.scale, from.scale, to.scale, alpha)
  return into
}

/**
 * 🛑 SLERPED, not interpolated angle by angle: where `eulerFromQuaternion` flips representation —
 * a pitch at the pole — all three angles jump together, and a plane rolling steeply was drawn
 * 179,99° from where it stood, one frame in two. Measured, and it reads as four wings.
 */
function turnBetween(from: Vector3, to: Vector3, alpha: number, into: Vector3): void {
  // The still case first: it is most of a scene, and it costs three conversions to answer.
  if (from.x === to.x && from.y === to.y && from.z === to.z) {
    copyAxes(into, to)
    return
  }

  quaternionFromEuler(from, HELD)
  quaternionFromEuler(to, WANTED)
  eulerFromQuaternion(quaternionSlerp(HELD, WANTED, alpha, STEPPED), into)
}

// Rewritten in place: a pose is drawn per entity per frame, and allocates nothing doing it.
const HELD: Quaternion = { x: 0, y: 0, z: 0, w: 1 }
const WANTED: Quaternion = { x: 0, y: 0, z: 0, w: 1 }
const STEPPED: Quaternion = { x: 0, y: 0, z: 0, w: 1 }

function lerpAxes(
  into: { x: number; y: number; z: number },
  from: { x: number; y: number; z: number },
  to: { x: number; y: number; z: number },
  alpha: number,
): void {
  if (from.x === to.x && from.y === to.y && from.z === to.z) {
    copyAxes(into, to)
    return
  }

  into.x = from.x + (to.x - from.x) * alpha
  into.y = from.y + (to.y - from.y) * alpha
  into.z = from.z + (to.z - from.z) * alpha
}
