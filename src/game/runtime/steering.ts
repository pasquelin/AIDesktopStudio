// SPDX-License-Identifier: MIT

import type { Vector3 } from '@shared/domain/transform'
import {
  angleBetween,
  eulerFromQuaternion,
  quaternionFromEuler,
  quaternionLookingAt,
  quaternionSlerp,
  type Quaternion,
} from '../physics/quaternion'
import type { Entity } from './entity'
import type { World } from './world'

/**
 * What the six travelling systems share: finding what an author NAMED, reading the points of a
 * rail, and turning without going the long way round.
 */
export type Targets = {
  /** The entity `said` stands for — its id first, then its name. Nothing for a name nobody wears. */
  of: (world: World, from: Entity, said: string) => Entity | null
}

/**
 * 🛑 Cached per follower, and not for speed alone: a name is scanned across every entity of the
 * scene, so a hundred followers would sweep the scene a hundred times a step. The cache is dropped
 * the moment the name changes or the entity it found is destroyed.
 */
export function createTargets(): Targets {
  const found = new WeakMap<Entity, { said: string; born: number; entity: Entity | null }>()

  return {
    of: (world, from, said) => {
      if (said === '') return null

      const born = world.entities.born()
      const kept = found.get(from)
      // 🛑 A MISS is remembered too: a name nobody wears would otherwise sweep the whole scene
      // for every follower on every step, which is the one case the cache exists for. It is held
      // only while the population stands — a script that spawns the very `Player` a turret was
      // looking for was otherwise never found again, for the life of the world.
      if (kept && kept.said === said && kept.born === born) {
        if (kept.entity === null) return null
        if (world.entities.get(kept.entity.id) !== null) return kept.entity
      }

      const entity = entityNamed(world, said)
      found.set(from, { said, born, entity })
      return entity
    },
  }
}

/** The entity a word names — its id first, then its name. What an author may write, said once. */
export function entityNamed(world: World, said: string): Entity | null {
  const byId = world.entities.get(said)
  if (byId) return byId

  for (const entity of world.entities.all()) if (entity.name === said) return entity
  return null
}

/**
 * The points of a rail, written `x y z, x y z, …`. Answers an empty list for anything it cannot
 * read — a rail nobody wrote is a component that does nothing, not one that throws.
 */
export function pointsOf(said: string): Vector3[] {
  const points: Vector3[] = []
  for (const part of said.split(',')) {
    const numbers = part.trim().split(/\s+/).map(Number)
    const [x, y, z] = numbers
    if (numbers.length !== 3 || x === undefined || y === undefined || z === undefined) continue
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue
    points.push({ x, y, z })
  }
  return points
}

/** Moves `at` towards `to` by at most `most`, and answers whether it arrived. */
export function stepTowards(at: Vector3, to: Vector3, most: number): boolean {
  const dx = to.x - at.x
  const dy = to.y - at.y
  const dz = to.z - at.z
  const distance = Math.hypot(dx, dy, dz)
  if (distance <= most || distance === 0) {
    at.x = to.x
    at.y = to.y
    at.z = to.z
    return true
  }

  at.x += (dx / distance) * most
  at.y += (dy / distance) * most
  at.z += (dz / distance) * most
  return false
}

/**
 * Points `rotation` along `direction` — at once when `most` is not positive, and by at most `most`
 * radians otherwise. Rewrites `rotation` in place, in the intrinsic XYZ a document's angles mean.
 *
 * 🛑 A direction of NOTHING leaves the rotation alone. `quaternionLookingAt` answers `into`
 * untouched there, and `into` is a scratch every caller shares: a cart sitting on its own
 * one-point rail would have been turned to whatever the last unrelated entity computed.
 */
export function turnTowards(rotation: Vector3, direction: Vector3, most: number): void {
  if (direction.x === 0 && direction.y === 0 && direction.z === 0) return

  quaternionLookingAt(direction, WANTED)
  if (most <= 0) {
    eulerFromQuaternion(WANTED, rotation)
    return
  }

  quaternionFromEuler(rotation, HELD)
  const angle = angleBetween(HELD, WANTED)
  if (angle <= most || angle === 0) {
    eulerFromQuaternion(WANTED, rotation)
    return
  }
  eulerFromQuaternion(quaternionSlerp(HELD, WANTED, most / angle, STEPPED), rotation)
}

// Reused across every turn of every step: a scene of a hundred turrets allocates nothing.
const WANTED: Quaternion = { x: 0, y: 0, z: 0, w: 1 }
const HELD: Quaternion = { x: 0, y: 0, z: 0, w: 1 }
const STEPPED: Quaternion = { x: 0, y: 0, z: 0, w: 1 }
