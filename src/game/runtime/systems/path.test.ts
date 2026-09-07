// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import type { Component } from '@shared/domain/component'
import { restingTransform } from '../entity'
import { STEP_SECONDS } from '../gameLoop'
import { testWorld } from '../world-fixtures'
import type { World } from '../world'
import { createPathSystem } from './path'

const cart = (over: Partial<Component> = {}): Component => ({
  type: 'Path',
  // The first corner is NOT where the cart stands: arriving somewhere costs the step that
  // notices it, and a rail starting under the cart would spend one doing nothing.
  waypoints: '4 0 0, 4 0 4',
  speed: 4,
  mode: 'loop',
  orientToTangent: false,
  ...over,
})

const playing = (component: Component): World => {
  const world = testWorld({ systems: [createPathSystem()] })
  world.entities.add({ id: 'a', name: 'a', transform: restingTransform(), components: [component] })
  return world
}

const after = (world: World, steps: number) => {
  for (let step = 0; step < steps; step++) world.step(STEP_SECONDS)
  return { ...(world.entities.get('a')?.transform.position ?? { x: 0, y: 0, z: 0 }) }
}

describe('what runs along a rail of points', () => {
  it('reaches the first corner at the pace it was given', () => {
    // Four metres a second over four metres: one second.
    expect(after(playing(cart()), 60).x).toBeCloseTo(4, 3)
  })

  it('goes on to the next corner rather than stopping at the first', () => {
    const at = after(playing(cart()), 120)

    expect(at.x).toBeCloseTo(4, 3)
    expect(at.z).toBeCloseTo(4, 3)
  })

  it('stops at the far end when it is asked to run once', () => {
    const world = playing(cart({ mode: 'once' }))
    const done = after(world, 240)

    expect(done).toEqual(after(world, 60))
  })

  it('turns to face where it is going when it is asked to', () => {
    const world = playing(cart({ orientToTangent: true }))
    after(world, 30)

    // Running along +X, and the node's forward is −Z: a quarter turn about Y, one way or the other.
    expect(Math.abs(world.entities.get('a')?.transform.rotation.y ?? 0)).toBeCloseTo(Math.PI / 2, 3)
  })

  /** A rail nobody wrote is a component that does nothing, not one that throws. */
  it('leaves an entity alone when its rail reads as nothing', () => {
    expect(after(playing(cart({ waypoints: 'north, 1 2, ' })), 60)).toEqual({ x: 0, y: 0, z: 0 })
  })
})
