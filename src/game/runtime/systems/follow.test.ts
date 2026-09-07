// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import type { Component } from '@shared/domain/component'
import { restingTransform } from '../entity'
import { STEP_SECONDS } from '../gameLoop'
import { testWorld } from '../world-fixtures'
import type { World } from '../world'
import { createFollowSystem } from './follow'

const chaser = (over: Partial<Component> = {}): Component => ({
  type: 'Follow',
  target: 'mark',
  speed: 3,
  stopDistance: 1.5,
  acceleration: 8,
  ...over,
})

function playing(component: Component, markX: number): World {
  const world = testWorld({ systems: [createFollowSystem()] })
  world.entities.add({ id: 'a', name: 'a', transform: restingTransform(), components: [component] })
  world.entities.add({
    id: 'mark_1',
    name: 'mark',
    transform: { ...restingTransform(), position: { x: markX, y: 0, z: 0 } },
    components: [],
  })
  return world
}

const chaseFor = (world: World, steps: number): number => {
  for (let step = 0; step < steps; step++) world.step(STEP_SECONDS)
  return world.entities.get('a')?.transform.position.x ?? Number.NaN
}

describe('what chases something else and stops short of it', () => {
  it('closes on the mark and settles at the distance it was told to keep', () => {
    expect(chaseFor(playing(chaser(), 10), 600)).toBeCloseTo(8.5, 2)
  })

  /** A follower that jumps to full speed on the first step reads as a teleport. */
  it('builds up to its pace rather than starting at it', () => {
    const world = playing(chaser(), 10)
    const first = chaseFor(world, 1)
    const second = chaseFor(world, 1) - first

    expect(first).toBeLessThan(3 * STEP_SECONDS)
    expect(second).toBeGreaterThan(first)
  })

  it('never overshoots the mark, however fast it was asked to go', () => {
    const world = playing(chaser({ speed: 200, acceleration: 2000 }), 10)
    const walked = Array.from({ length: 120 }, () => chaseFor(world, 1))

    expect(Math.max(...walked)).toBeLessThanOrEqual(8.5 + 1e-6)
  })

  it('leaves an entity alone when it names a mark nobody wears', () => {
    expect(chaseFor(playing(chaser({ target: 'nobody' }), 10), 60)).toBe(0)
  })
})
