// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import type { Component } from '@shared/domain/component'
import { restingTransform } from '../entity'
import { STEP_SECONDS } from '../gameLoop'
import { testWorld } from '../world-fixtures'
import type { World } from '../world'
import { createOrbitSystem } from './orbit'

const satellite = (over: Partial<Component> = {}): Component => ({
  type: 'Orbit',
  target: '',
  radius: 5,
  speed: 90,
  height: 0,
  ...over,
})

function playing(component: Component, markX = 0): World {
  const world = testWorld({ systems: [createOrbitSystem()] })
  world.entities.add({ id: 'a', name: 'a', transform: restingTransform(), components: [component] })
  world.entities.add({
    id: 'mark_1',
    name: 'mark',
    transform: { ...restingTransform(), position: { x: markX, y: 2, z: 0 } },
    components: [],
  })
  return world
}

const after = (world: World, steps: number) => {
  for (let step = 0; step < steps; step++) world.step(STEP_SECONDS)
  return { ...(world.entities.get('a')?.transform.position ?? { x: 0, y: 0, z: 0 }) }
}

describe('what turns about something else', () => {
  it('holds its radius about the origin when it names nobody', () => {
    const at = after(playing(satellite()), 37)

    expect(Math.hypot(at.x, at.z)).toBeCloseTo(5, 6)
    expect(at.y).toBe(0)
  })

  it('comes back where it started after a full turn', () => {
    const world = playing(satellite())
    const first = after(world, 1)
    // Ninety degrees a second is a full turn in 240 steps, counted FROM the first one.
    const round = after(world, 240)

    expect(round.x).toBeCloseTo(first.x, 3)
    expect(round.z).toBeCloseTo(first.z, 3)
  })

  it('turns about the mark it names, and hangs at the height it was given', () => {
    const at = after(playing(satellite({ target: 'mark', height: 1 }), 20), 60)

    expect(Math.hypot(at.x - 20, at.z)).toBeCloseTo(5, 6)
    expect(at.y).toBeCloseTo(3, 6)
  })
})
