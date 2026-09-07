// SPDX-License-Identifier: MIT

import type { Component, ComponentType } from '@shared/domain/component'
import type { Entity } from './entity'

/**
 * The entities of one world, indexed by id and BY COMPONENT TYPE.
 *
 * The index is the whole reason this is not an array: a system declares what it reads, and it must
 * visit the entities carrying that component rather than sweep every entity of the scene. A `Map`
 * and a `Set` both iterate in insertion order, so the sweep is deterministic — which the fixed
 * step rests on.
 *
 * 🛑 `attach` and `detach` rather than writing `entity.components` by hand: a component added
 * behind the store's back leaves the index stale, the system stops seeing the entity, and nothing
 * goes red. Both write IMMEDIATELY — a system attaches through `world.attach`, which defers to the
 * end of the step, because a `Set` visits what is added to it while it is being walked.
 */
export type EntityStore = {
  add: (entity: Entity) => void
  remove: (id: string) => boolean
  get: (id: string) => Entity | null
  /** Every entity, in the order they arrived. */
  all: () => Iterable<Entity>
  /** Those carrying `type`, in the order they gained it. Live, and allocates nothing per call. */
  withComponent: (type: ComponentType) => Iterable<Entity>
  attach: (entity: Entity, component: Component) => void
  detach: (entity: Entity, type: ComponentType) => boolean
  count: () => number
  /**
   * Bumped whenever the POPULATION changes, never for a component. What a cache of names reads to
   * know its answer may have gone stale — a miss above all, which nothing else could invalidate.
   */
  born: () => number
}

export function createEntityStore(): EntityStore {
  const byId = new Map<string, Entity>()
  const byComponent = new Map<ComponentType, Set<Entity>>()
  let born = 0

  const indexed = (type: ComponentType): Set<Entity> => {
    const held = byComponent.get(type)
    if (held) return held
    const made = new Set<Entity>()
    byComponent.set(type, made)
    return made
  }

  const add = (entity: Entity): void => {
    born += 1
    byId.set(entity.id, entity)
    for (let index = 0; index < entity.components.length; index++) {
      const component = entity.components[index]
      if (component) indexed(component.type).add(entity)
    }
  }

  return {
    add,

    remove: id => {
      const entity = byId.get(id)
      if (!entity) return false

      born += 1
      byId.delete(id)
      for (let index = 0; index < entity.components.length; index++) {
        const component = entity.components[index]
        if (component) byComponent.get(component.type)?.delete(entity)
      }
      return true
    },

    get: id => byId.get(id) ?? null,
    born: () => born,
    all: () => byId.values(),
    // The real set, made on first ask: a sweep held by a system before anything carried the type
    // would otherwise be a frozen empty one, for the life of the world.
    withComponent: type => indexed(type),

    attach: (entity, component) => {
      const at = entity.components.findIndex(held => held.type === component.type)
      if (at >= 0) entity.components[at] = component
      else entity.components.push(component)
      indexed(component.type).add(entity)
    },

    detach: (entity, type) => {
      const at = entity.components.findIndex(held => held.type === type)
      if (at < 0) return false

      entity.components.splice(at, 1)
      byComponent.get(type)?.delete(entity)
      return true
    },

    count: () => byId.size,
  }
}
