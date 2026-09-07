// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import { newComponent } from '@shared/domain/componentRegistry'
import { DEFAULT_PLAY } from '@shared/domain/scene'
import type { Component } from '@shared/domain/component'
import type { GameEvent, GameEventName } from '@shared/domain/gameEvent'
import { createIntents } from '../intents'
import { notedPhysics, type NotedPhysics } from '../../physics/physics-fixtures'
import { createCharacters } from '../characters'
import { createPossessions } from '../possessions'
import type { ColliderShape } from '../../physics/shape'
import { restingTransform } from '../entity'
import { testPorts, testWorld } from '../world-fixtures'
import type { World, WorldOptions } from '../world'
import { COMPONENTS } from '@shared/domain/componentRegistry'
import { createPhysicsSystem, PHYSICAL } from './physics'

const STEP = 1 / 60
const CUBE: ColliderShape = { kind: 'cuboid', hx: 0.5, hy: 0.5, hz: 0.5 }

type Bench = { world: World; physics: NotedPhysics; seen: GameEvent[] }

function bench(over: Partial<WorldOptions> = {}): Bench {
  const physics = notedPhysics()
  const seen: GameEvent[] = []

  // One `possessions` for both: `characters` reads it, and `settle` reads the same answer.
  const possessions = createPossessions()
  const characters = createCharacters(possessions, entity => entity.transform, createIntents())
  const world = testWorld({
    ports: testPorts({ physics }),
    systems: [createPhysicsSystem({ shapeOf: () => CUBE, characters, possessions })],
    ...over,
  })

  const watched: GameEventName[] = ['Collided', 'TriggerEntered', 'TriggerExited']
  for (const name of watched) {
    world.events.on(name, event => seen.push(event))
  }

  return { world, physics, seen }
}

const put = (world: World, id: string, components: Component[]): void => {
  world.entities.add({ id, name: id, transform: restingTransform(), components })
}

/**
 * The list is copied because this tree may take no VALUE from `@shared/`. Held here, where a
 * suite may read both: a fifth physics component would otherwise get its form, its schema and
 * its translations, appear in the inspector, and never once be simulated.
 */
describe('the components that reach the simulation', () => {
  it('names exactly the ones the registry files under physics', () => {
    const declared = Object.values(COMPONENTS)
      .filter(descriptor => descriptor.category === 'physics')
      .map(descriptor => descriptor.type)

    expect([...PHYSICAL].sort()).toEqual(declared.sort())
  })
})

describe('what falls, what blocks and what walks', () => {
  it('reads the pull the scene declares, once', () => {
    const { world, physics } = bench({ play: { ...DEFAULT_PLAY, gravity: 9.81 } })

    world.step(STEP)
    world.step(STEP)

    expect(physics.gravity).toBeCloseTo(-9.81, 6)
    expect(physics.steps).toEqual([STEP, STEP])
  })

  it('gives a body to every entity that carries one, and only once', () => {
    const { world, physics } = bench()
    put(world, 'crate', [newComponent('Collider'), newComponent('RigidBody')])

    world.step(STEP)
    world.step(STEP)

    expect(physics.added.map(body => body.body)).toEqual(['crate'])
    expect(physics.added[0]?.kind).toBe('dynamic')
  })

  /**
   * 🛑 A `Collider` alone is how an author says SOLID — a wall, a floor, a trigger volume. Read
   * as `dynamic`, every one of them fell out of the world on the first frame.
   */
  it('holds a volume still when nothing said it should be simulated', () => {
    const { world, physics } = bench()
    put(world, 'wall', [newComponent('Collider')])
    put(world, 'gate', [newComponent('Collider'), newComponent('Trigger')])

    world.step(STEP)

    expect(physics.added.map(body => body.kind)).toEqual(['fixed', 'fixed'])
  })

  it('takes the body away with the entity that carried it', () => {
    const { world, physics } = bench()
    put(world, 'crate', [newComponent('Collider')])

    world.step(STEP)
    world.destroy('crate')
    // Two: a death lands at the END of the step it was asked in, so the sweep sees it in the next.
    world.step(STEP)
    world.step(STEP)

    expect(physics.removed).toEqual(['crate'])
  })

  /** A `Trigger` blocks nothing, which is a sensor — and it is read off the components, not asked. */
  it('marks a trigger as a sensor and a controller as one that is driven', () => {
    const { world, physics } = bench()
    put(world, 'gate', [newComponent('Collider'), newComponent('Trigger')])
    put(world, 'hero', [newComponent('CharacterController')])

    world.step(STEP)

    expect(physics.added.find(body => body.body === 'gate')?.sensor).toBe(true)
    expect(physics.added.find(body => body.body === 'hero')?.kind).toBe('kinematic')
    expect(physics.added.find(body => body.body === 'hero')?.shape.kind).toBe('capsule')
  })

  /** The mesh a controller is DRAWN as is not the body it is felt as. */
  it('feels a controller as its own capsule, never as the shape it draws', () => {
    const { world, physics } = bench()
    put(world, 'hero', [newComponent('CharacterController')])

    world.step(STEP)
    const shape = physics.added[0]?.shape

    expect(shape?.kind).toBe('capsule')
    // The straight part only, as a capsule is counted: 1,8 tall less a cap at each end.
    expect(shape?.kind === 'capsule' ? shape.halfHeight : 0).toBeCloseTo(0.6, 6)
    expect(shape?.kind === 'capsule' ? shape.radius : 0).toBeCloseTo(0.3, 6)
  })

  it('says nothing to the physics about an entity that carries no component of its own', () => {
    const { world, physics } = bench()
    put(world, 'decor', [])

    world.step(STEP)

    expect(physics.added).toEqual([])
  })

  it('writes what the step moved back into the entity', () => {
    const { world, physics } = bench()
    put(world, 'crate', [newComponent('Collider'), newComponent('RigidBody')])
    physics.answers.poses = [
      { body: 'crate', position: { x: 1, y: 2, z: 3 }, rotation: { x: 0, y: 0, z: 0, w: 1 } },
    ]

    world.step(STEP)

    expect(world.entities.get('crate')?.transform.position).toEqual({ x: 1, y: 2, z: 3 })
  })

  it('drives a kinematic body from where the game put it', () => {
    const { world, physics } = bench()
    const kinematic: Component = { ...newComponent('RigidBody'), kind: 'kinematic' }
    put(world, 'lift', [newComponent('Collider'), kinematic])
    const lift = world.entities.get('lift')
    if (lift) lift.transform.position.y = 4

    world.step(STEP)

    expect(physics.placed[0]).toMatchObject({ body: 'lift', position: { y: 4 } })
  })

  /**
   * No engine sends a parting event for a body it REMOVES, so a pair left behind would sit in the
   * set for the life of the session — and the door it opened would never close.
   */
  it('forgets a trigger pair with the entity that was standing in it', () => {
    const { world, physics, seen } = bench()
    put(world, 'gate', [newComponent('Collider'), newComponent('Trigger')])
    physics.answers.contacts = [{ body: 'gate', other: 'hero', started: true, sensed: true }]
    world.step(STEP)

    world.destroy('gate')
    world.step(STEP)
    world.step(STEP)
    put(world, 'gate', [newComponent('Collider'), newComponent('Trigger')])
    world.step(STEP)

    expect(seen.map(event => event.name)).toEqual(['TriggerEntered', 'TriggerEntered'])
  })

  it('says on the bus what hit what', () => {
    const { world, physics, seen } = bench()
    put(world, 'crate', [newComponent('Collider'), newComponent('RigidBody')])
    physics.answers.contacts = [{ body: 'crate', other: 'floor', started: true, sensed: false }]

    world.step(STEP)

    expect(seen).toEqual([{ name: 'Collided', entity: 'crate', payload: { other: 'floor' } }])
  })

  /**
   * 🛑 One entry and one exit per PAIR: a solid felt as several convex pieces meets a trigger
   * more than once, and a door counting contacts would stay open behind whoever walked through.
   */
  it('announces a trigger once however many pieces of it were touched', () => {
    const { world, physics, seen } = bench()
    put(world, 'gate', [newComponent('Collider'), newComponent('Trigger')])
    physics.answers.contacts = [
      { body: 'gate', other: 'hero', started: true, sensed: true },
      { body: 'gate', other: 'hero', started: true, sensed: true },
    ]

    world.step(STEP)
    physics.answers.contacts = [{ body: 'gate', other: 'hero', started: false, sensed: true }]
    world.step(STEP)

    expect(seen.map(event => event.name)).toEqual(['TriggerEntered', 'TriggerExited'])
  })

  it('says nothing of a body that stands for no entity of the scene', () => {
    const { world, physics, seen } = bench()
    physics.answers.contacts = [
      { body: 'world.ground', other: 'crate', started: true, sensed: false },
    ]

    world.step(STEP)

    expect(seen).toEqual([])
  })

  /**
   * A shape that could not be derived cannot be derived next frame either — retrying would
   * rebuild a three.js geometry sixty times a second, for ever.
   */
  it('asks for a shape once, not once a frame', () => {
    const physics = notedPhysics()
    const characters = createCharacters(
      createPossessions(),
      entity => entity.transform,
      createIntents(),
    )
    let asked = 0
    const world = testWorld({
      ports: testPorts({ physics }),
      systems: [
        createPhysicsSystem({
          shapeOf: () => {
            asked += 1
            return null
          },
          characters,
          possessions: createPossessions(),
        }),
      ],
    })
    put(world, 'ghost', [newComponent('Collider')])

    world.step(STEP)
    world.step(STEP)
    world.step(STEP)

    expect(asked).toBe(1)
  })
})
