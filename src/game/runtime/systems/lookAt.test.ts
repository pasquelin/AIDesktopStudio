// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import type { Component } from '@shared/domain/component'
import type { Vector3 } from '@shared/domain/transform'
import { quaternionFromEuler } from '../../physics/quaternion'
import { restingTransform } from '../entity'
import { STEP_SECONDS } from '../gameLoop'
import { testWorld } from '../world-fixtures'
import type { World } from '../world'
import { createLookAtSystem } from './lookAt'

const watcher = (over: Partial<Component> = {}): Component => ({
  type: 'LookAt',
  target: 'mark',
  turnSpeed: 0,
  ...over,
})

function playing(component: Component, markAt: Vector3): World {
  const world = testWorld({ systems: [createLookAtSystem()] })
  world.entities.add({ id: 'a', name: 'a', transform: restingTransform(), components: [component] })
  world.entities.add({
    id: 'mark_1',
    name: 'mark',
    transform: { ...restingTransform(), position: markAt },
    components: [],
  })
  return world
}

/** Where the node's forward — three's −Z — points once the rotation is applied. */
function forwardOf(world: World): Vector3 {
  const turn = quaternionFromEuler(world.entities.get('a')?.transform.rotation ?? ZERO)
  const { x, y, z, w } = turn
  return {
    x: 2 * (x * z + w * y) * -1,
    y: 2 * (y * z - w * x) * -1,
    z: (1 - 2 * (x * x + y * y)) * -1,
  }
}

const ZERO: Vector3 = { x: 0, y: 0, z: 0 }

describe('what faces something else', () => {
  it('points its forward straight at the mark, in one step, at a turn speed of nothing', () => {
    const world = playing(watcher(), { x: 5, y: 0, z: 0 })
    world.step(STEP_SECONDS)

    const forward = forwardOf(world)
    expect(forward.x).toBeCloseTo(1, 5)
    expect(forward.y).toBeCloseTo(0, 5)
    expect(forward.z).toBeCloseTo(0, 5)
  })

  it('faces a mark overhead, where three angles about one axis would flip', () => {
    const world = playing(watcher(), { x: 0, y: 5, z: 0 })
    world.step(STEP_SECONDS)

    expect(forwardOf(world).y).toBeCloseTo(1, 5)
  })

  /** A cap in degrees a second: a turret does not snap round, it sweeps. */
  it('takes its time when a turning speed caps it, and arrives all the same', () => {
    const world = playing(watcher({ turnSpeed: 90 }), { x: 5, y: 0, z: 0 })

    world.step(STEP_SECONDS)
    expect(forwardOf(world).x).toBeLessThan(0.1)

    for (let step = 0; step < 120; step++) world.step(STEP_SECONDS)
    expect(forwardOf(world).x).toBeCloseTo(1, 3)
  })

  it('leaves an entity alone when it names a mark nobody wears', () => {
    const world = playing(watcher({ target: 'nobody' }), { x: 5, y: 0, z: 0 })
    world.step(STEP_SECONDS)

    expect(world.entities.get('a')?.transform.rotation).toEqual({ x: 0, y: 0, z: 0 })
  })
})
