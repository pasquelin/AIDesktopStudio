// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import type { Component } from '@shared/domain/component'
import { restingTransform } from '../entity'
import { STEP_SECONDS } from '../gameLoop'
import { testWorld } from '../world-fixtures'
import type { World } from '../world'
import { createSpinSystem } from './spin'

const spinner = (over: Partial<Component> = {}): Component => ({
  type: 'Spin',
  axis: 'y',
  speed: 90,
  ...over,
})

const playing = (component: Component): World => {
  const world = testWorld({ systems: [createSpinSystem()] })
  world.entities.add({ id: 'a', name: 'a', transform: restingTransform(), components: [component] })
  return world
}

const after = (world: World, steps: number): { x: number; y: number; z: number } => {
  for (let step = 0; step < steps; step++) world.step(STEP_SECONDS)
  return { ...(world.entities.get('a')?.transform.rotation ?? { x: 0, y: 0, z: 0 }) }
}

describe('what turns on its own and never stops', () => {
  it('turns a quarter circle a second at ninety degrees a second', () => {
    expect(after(playing(spinner()), 60).y).toBeCloseTo(Math.PI / 2, 3)
  })

  it('turns about the axis it was given, and about no other', () => {
    const turned = after(playing(spinner({ axis: 'x' })), 60)

    expect(turned.x).toBeCloseTo(Math.PI / 2, 3)
    expect(turned.y).toBe(0)
    expect(turned.z).toBe(0)
  })

  it('turns the other way for a negative speed', () => {
    expect(after(playing(spinner({ speed: -90 })), 60).y).toBeCloseTo(-Math.PI / 2, 3)
  })

  /** A session spent spinning walks the angle into floats where a degree stops resolving. */
  it('wraps rather than walking the angle off into large numbers', () => {
    expect(Math.abs(after(playing(spinner({ speed: 720 })), 600).y)).toBeLessThan(Math.PI * 2)
  })
})
