// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import type { Transform } from '@shared/domain/transform'
import { createIntents } from '../intents'
import { clonedTransform, restingTransform, type Entity } from '../entity'
import { STEP_SECONDS } from '../gameLoop'
import { createPossessions } from '../possessions'
import { testWorld } from '../world-fixtures'
import type { World } from '../world'
import { createPossessionSystem } from './possession'

const at = (x: number, y: number, z: number): Transform => ({
  ...restingTransform(),
  position: { x, y, z },
})

/** A module, its body, and a car standing away from both — the shape the studio lays down. */
function riding(possesses: string): {
  world: World
  body: () => Entity | null
  frame: () => void
} {
  const possessions = createPossessions()
  const world = testWorld({
    systems: [
      createPossessionSystem({
        possessions,
        bodyIdOf: moduleId => (moduleId === 'module' ? 'body' : null),
        // No hierarchy here: the three hang from nothing, so world and local are the same.
        worldOf: (_entity, own) => own,
        localOf: () => null,
      }),
    ],
  })
  world.entities.add({
    id: 'module',
    name: 'Player_Module',
    transform: restingTransform(),
    components: [{ type: 'Player', from: '', possesses }],
  })
  world.entities.add({
    id: 'body',
    name: 'Capsule',
    transform: at(0, 0.9, 0),
    components: [{ type: 'CharacterController', height: 1.8, radius: 0.3 }],
  })
  world.entities.add({ id: 'car', name: 'Car', transform: at(10, 0, -4), components: [] })
  // A whole frame, as the loop runs one: the step freezes, the late pass carries.
  const frame = () => {
    world.step(STEP_SECONDS)
    world.lateUpdate(1, STEP_SECONDS)
  }
  return { world, body: () => world.entities.get('body'), frame }
}

describe('a player that rides something else', () => {
  it('carries its body to whatever it possesses', () => {
    const { body, frame } = riding('Car')

    frame()

    expect(body()?.transform.position).toEqual({ x: 10, y: 0, z: -4 })
  })

  /** 🛑 Carried and never REPARENTED: `hierarchy` composes off the document's tree, which a game
   * does not rewrite — so a body that follows has to be written, step after step. */
  it('follows what it rides as that moves', () => {
    const { world, body, frame } = riding('Car')
    frame()

    const car = world.entities.get('car')
    if (car) car.transform.position.x = 25
    frame()

    expect(body()?.transform.position.x).toBe(25)
  })

  it('leaves its body where it stands when it possesses nothing', () => {
    const { body, frame } = riding('')
    const stood = clonedTransform(body()?.transform ?? restingTransform())

    frame()

    expect(body()?.transform.position).toEqual(stood.position)
  })

  /** Naming its own body is riding nothing, said plainly rather than left to carry itself. */
  it('leaves its body alone when it names the body itself', () => {
    const { body, frame } = riding('Capsule')

    frame()

    expect(body()?.transform.position).toEqual({ x: 0, y: 0.9, z: 0 })
  })

  it('leaves its body alone when it names something the scene does not hold', () => {
    const { body, frame } = riding('Submarine')

    frame()

    expect(body()?.transform.position).toEqual({ x: 0, y: 0.9, z: 0 })
  })

  /** Getting out has to take effect at once: a seat held for one more step drags the body back. */
  it('frees the body on the very step the player lets go', () => {
    const { world, body, frame } = riding('Car')
    frame()

    const module = world.entities.get('module')
    if (module) module.components = [{ type: 'Player', from: '', possesses: '' }]
    frame()
    const car = world.entities.get('car')
    if (car) car.transform.position.x = 99
    frame()

    expect(body()?.transform.position.x).toBe(10)
  })
})

describe('what a held body asks the physics for', () => {
  it('asks for nothing at all, so it neither walks nor falls', async () => {
    const { createCharacters } = await import('../characters')
    const possessions = createPossessions()
    const world = testWorld()
    world.entities.add({
      id: 'body',
      name: 'Capsule',
      transform: at(0, 5, 0),
      components: [{ type: 'CharacterController', height: 1.8, radius: 0.3 }],
    })

    const characters = createCharacters(possessions, entity => entity.transform, createIntents())
    expect(characters.intents(world, STEP_SECONDS)).toHaveLength(1)

    possessions.hold('body')

    expect(characters.intents(world, STEP_SECONDS)).toEqual([])
  })
})

/**
 * 🛑 The other half of freezing a body: `characters.intents` asks the port for nothing, but the
 * port keeps REPORTING the walker, and `settle` writes that stale pose back on every fixed step —
 * ahead of the late pass that carries. Anything reading the body inside a step saw it standing
 * where it boarded, and dismounting resumed from there.
 */
describe('a held body against the physics', () => {
  it('is left where it was carried, not where the engine still reports it', async () => {
    const { createPhysicsSystem } = await import('./physics')
    const { createCharacters } = await import('../characters')
    const possessions = createPossessions()
    const world = testWorld({
      systems: [
        createPhysicsSystem({
          shapeOf: () => null,
          characters: createCharacters(possessions, entity => entity.transform, createIntents()),
          possessions,
        }),
      ],
    })
    world.entities.add({
      id: 'body',
      name: 'Capsule',
      transform: at(0, 0.9, 0),
      components: [{ type: 'CharacterController', height: 1.8, radius: 0.3 }],
    })
    world.step(STEP_SECONDS)

    // Carried onto something that has driven off, as `possession.lateUpdate` writes it.
    possessions.hold('body')
    const body = world.entities.get('body')
    if (body) body.transform.position.x = 30
    world.step(STEP_SECONDS)

    expect(world.entities.get('body')?.transform.position.x).toBe(30)
  })
})
