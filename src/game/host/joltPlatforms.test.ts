// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, expect, it } from 'vitest'
import type { PhysicsPort } from '../ports/physicsPort'
import { describedBody, restingAt } from '../physics/physics-fixtures'
import { loadJoltPhysics } from './joltPhysics'
import { poseOf, STEP } from './joltPhysics-fixtures'

let port: PhysicsPort

beforeEach(async () => {
  port = await loadJoltPhysics()
  port.setGravity(-9.81)
  port.add([
    describedBody({
      body: 'platform',
      kind: 'kinematic',
      shape: { kind: 'cuboid', hx: 4, hy: 0.25, hz: 4 },
      transform: restingAt(0, 0, 0),
    }),
    describedBody({
      body: 'walker',
      kind: 'kinematic',
      shape: { kind: 'capsule', halfHeight: 0.6, radius: 0.3 },
      transform: restingAt(1, 1.15, 0),
      character: { stepHeight: 0.5, slopeLimit: 45, snapDistance: 0.5 },
    }),
  ])
  for (let step = 0; step < 30; step++) advance()
})

afterEach(() => port.dispose())

function advance(x = 0, y = 0, yaw = 0, walk = 0, jump = -1): void {
  port.place([
    {
      body: 'platform',
      position: { x, y, z: 0 },
      rotation: { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) },
    },
  ])
  port.moveCharacters([
    { body: 'walker', wanted: { x: walk * STEP, y: jump * STEP, z: 0 }, facing: null },
  ])
  port.step(STEP)
}

it.each(['horizontal', 'vertical'])(
  'carries a resting walker with a %s platform and stops with it',
  axis => {
    for (let step = 1; step <= 120; step++)
      advance(axis === 'horizontal' ? step * STEP : 0, axis === 'vertical' ? step * STEP : 0)
    const arrived = { ...poseOf(port, 'walker')!.position }
    expect(arrived.x).toBeCloseTo(axis === 'horizontal' ? 3 : 1, 1)
    expect(arrived.y).toBeCloseTo(axis === 'vertical' ? 3.15 : 1.15, 1)
    for (let step = 0; step < 30; step++)
      advance(axis === 'horizontal' ? 2 : 0, axis === 'vertical' ? 2 : 0)
    expect(poseOf(port, 'walker')!.position.x).toBeCloseTo(arrived.x, 2)
    expect(poseOf(port, 'walker')!.position.y).toBeCloseTo(arrived.y, 2)
  },
)

it('carries a walker around the rotation axis at its contact point', () => {
  for (let step = 1; step <= 120; step++) advance(0, 0, ((step / 120) * Math.PI) / 2)
  const at = poseOf(port, 'walker')!.position
  expect(at.x).toBeCloseTo(0, 1)
  expect(at.z).toBeCloseTo(-1, 1)
})

it('adds walking to the support motion instead of pinning the walker to it', () => {
  for (let step = 1; step <= 60; step++) advance(step * STEP, 0, 0, 1)
  expect(poseOf(port, 'walker')!.position.x).toBeCloseTo(3, 1)
})

it('keeps takeoff momentum without following a platform that reverses after a jump', () => {
  for (let step = 1; step <= 60; step++) advance(step * STEP)
  const start = { ...poseOf(port, 'walker')!.position }
  advance(1 + STEP, 0, 0, 0, 4)
  for (let step = 1; step <= 20; step++)
    advance(1 + STEP - step * STEP, 0, 0, 0, 4 - 9.81 * step * STEP)
  const airborne = poseOf(port, 'walker')!.position
  expect(airborne.y).toBeGreaterThan(start.y + 0.5)
  expect(airborne.x).toBeGreaterThan(start.x + 0.2)
})

it('follows a descending platform without losing contact', () => {
  for (let step = 1; step <= 120; step++) advance(0, -step * STEP)
  expect(poseOf(port, 'walker')!.position.y).toBeCloseTo(-0.85, 1)
})

it('does not carry a rider through a wall', () => {
  port.add([
    describedBody({
      body: 'wall',
      kind: 'fixed',
      shape: { kind: 'cuboid', hx: 0.25, hy: 2, hz: 4 },
      transform: restingAt(2.5, 2.5, 0),
    }),
  ])
  for (let step = 1; step <= 120; step++) advance(step * STEP)
  const at = poseOf(port, 'walker')!.position
  expect(at.x).toBeGreaterThan(1.8)
  expect(at.x).toBeLessThan(2)
})
