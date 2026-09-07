// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import type { Component } from '@shared/domain/component'
import { restingTransform } from '../entity'
import { STEP_SECONDS } from '../gameLoop'
import { testWorld } from '../world-fixtures'
import type { World } from '../world'
import { createPatrolSystem } from './patrol'

const sentry = (over: Partial<Component> = {}): Component => ({
  type: 'Patrol',
  // Neither mark is where the sentry stands: arriving costs the step that notices it.
  waypoints: 'there, far',
  speed: 4,
  waitSeconds: 0,
  mode: 'pingPong',
  ...over,
})

/** The two marks the round names, and where they stand. */
const MARKS: readonly { name: string; x: number }[] = [
  { name: 'there', x: 4 },
  { name: 'far', x: 9 },
]

function playing(component: Component): World {
  const world = testWorld({ systems: [createPatrolSystem()] })
  world.entities.add({ id: 'a', name: 'a', transform: restingTransform(), components: [component] })
  for (const { name, x } of MARKS) {
    world.entities.add({
      id: `mark_${name}`,
      name,
      transform: { ...restingTransform(), position: { x, y: 0, z: 0 } },
      components: [],
    })
  }
  return world
}

const after = (world: World, steps: number): number => {
  for (let step = 0; step < steps; step++) world.step(STEP_SECONDS)
  return world.entities.get('a')?.transform.position.x ?? Number.NaN
}

describe('what walks from one named mark to the next', () => {
  it('walks to the far mark at the pace it was given', () => {
    expect(after(playing(sentry()), 60)).toBeCloseTo(4, 3)
  })

  it('walks back the way it came when it is asked to go to and fro', () => {
    // Sampled rather than counted to the step: arriving is decided by a distance against a float,
    // so which step notices it moves by one, and the round is what the case is about.
    const world = playing(sentry())
    // Past the approach: the sentry starts BELOW the first mark, and that leg is not the round.
    after(world, 120)
    const walked = Array.from({ length: 400 }, () => after(world, 1))

    expect(Math.max(...walked)).toBeCloseTo(9, 2)
    expect(Math.min(...walked)).toBeCloseTo(4, 2)
  })

  it('waits at a mark before setting off again', () => {
    const world = playing(sentry({ waitSeconds: 1 }))

    expect(after(world, 60)).toBeCloseTo(4, 3)
    expect(after(world, 60)).toBeCloseTo(4, 3)
    expect(after(world, 5)).toBeGreaterThan(4)
  })

  it('stops at the last mark when it is asked to walk the round once', () => {
    const world = playing(sentry({ mode: 'once' }))

    expect(after(world, 240)).toBeCloseTo(9, 3)
    expect(after(world, 240)).toBeCloseTo(9, 3)
  })

  it('leaves an entity alone when it names marks nobody wears', () => {
    expect(after(playing(sentry({ waypoints: 'nobody, nowhere' })), 60)).toBe(0)
  })
})
