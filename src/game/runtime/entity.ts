// SPDX-License-Identifier: MIT

import type { Component, ComponentType } from '@shared/domain/component'
import type { Transform, Vector3 } from '@shared/domain/transform'

/**
 * What the runtime moves, as opposed to what a document holds.
 *
 * MUTABLE, and deliberately: a step writes `transform.position.x` in place rather than rebuilding
 * an object per entity per frame. The edit state stays immutable, in the document store, and the
 * runtime holds no reference to it — which is what makes Play Mode safe by construction.
 */
export type Entity = {
  readonly id: string
  name: string
  transform: Transform
  /**
   * Where it stood BEFORE the last fixed step — what a frame falling between two steps is drawn
   * from. Written by `world.step`, absent until one has run.
   */
  previous?: Transform
  components: Component[]
}

/**
 * A fresh transform at the origin. Not `IDENTITY_TRANSFORM`, which is a shared CONSTANT a step
 * would be writing into — and not a value this tree may import anyway.
 */
export function restingTransform(): Transform {
  return {
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  }
}

/** A transform nothing else holds a reference into. Spelt here: this tree ships without `@shared/`. */
export const clonedTransform = (transform: Transform): Transform => ({
  position: { ...transform.position },
  rotation: { ...transform.rotation },
  scale: { ...transform.scale },
})

export function copyTransformInto(into: Transform, from: Transform): void {
  copyAxes(into.position, from.position)
  copyAxes(into.rotation, from.rotation)
  copyAxes(into.scale, from.scale)
}

export function copyAxes(into: Vector3, from: Vector3): void {
  into.x = from.x
  into.y = from.y
  into.z = from.z
}

/**
 * The one component of that type an entity carries, or nothing. Indexed rather than `find`: it is
 * read several times per entity per step, and a closure an allocation each would be the bulk of it.
 */
export function componentOf(entity: Entity, type: ComponentType): Component | null {
  for (let index = 0; index < entity.components.length; index++) {
    const held = entity.components[index]
    if (held?.type === type) return held
  }
  return null
}
