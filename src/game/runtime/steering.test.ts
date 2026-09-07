// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import { restingTransform } from './entity'
import { createTargets, entityNamed, turnTowards } from './steering'
import { testWorld } from './world-fixtures'
import type { World } from './world'

const peopled = (names: readonly string[]): World => {
  const world = testWorld()
  for (const name of names) {
    world.entities.add({ id: `id-${name}`, name, transform: restingTransform(), components: [] })
  }
  return world
}

describe('entityNamed', () => {
  it('answers by id first, then by name, and nothing for a word nobody wears', () => {
    const world = peopled(['Turnstile', 'Beacon'])

    expect(entityNamed(world, 'id-Beacon')?.name).toBe('Beacon')
    expect(entityNamed(world, 'Turnstile')?.id).toBe('id-Turnstile')
    expect(entityNamed(world, 'Nobody')).toBeNull()
  })
})

/**
 * A miss is cached, and it has to be: a name nobody wears would otherwise sweep the whole scene
 * for every follower on every step. Held past a spawn, though, a turret that once looked for a
 * `Player` a script had not made yet never turned again — for the life of the world.
 */
describe('the target a word names, once it is cached', () => {
  const turret = { id: 'id-Turret', name: 'Turret', transform: restingTransform(), components: [] }

  it('finds an entity that was spawned after the miss', () => {
    const world = peopled(['Turret'])
    const targets = createTargets()
    expect(targets.of(world, turret, 'Player')).toBeNull()

    world.entities.add({
      id: 'id-Player',
      name: 'Player',
      transform: restingTransform(),
      components: [],
    })

    expect(targets.of(world, turret, 'Player')?.id).toBe('id-Player')
  })

  it('still answers a name nobody wears while the population stands', () => {
    const world = peopled(['Turret'])
    const targets = createTargets()

    expect(targets.of(world, turret, 'Nobody')).toBeNull()
    expect(targets.of(world, turret, 'Nobody')).toBeNull()
  })
})

describe('turnTowards', () => {
  const turned = (direction: { x: number; y: number; z: number }) => {
    const rotation = { x: 0, y: 0.5, z: 0 }
    turnTowards(rotation, direction, 0)
    return rotation
  }

  it('points a rotation down the direction it is given', () => {
    expect(turned({ x: -1, y: 0, z: 0 }).y).toBeCloseTo(Math.PI / 2, 3)
  })

  /**
   * 🛑 `quaternionLookingAt` answers `into` UNTOUCHED for a zero direction, and `into` is a
   * scratch every caller shares: a cart sitting on its own one-point rail was turned to whatever
   * the last unrelated entity had computed.
   */
  it('leaves a rotation alone rather than reading the last caller’s working quaternion', () => {
    turned({ x: -1, y: 0, z: 0 })

    expect(turned({ x: 0, y: 0, z: 0 })).toEqual({ x: 0, y: 0.5, z: 0 })
  })
})
