// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import { createInertPhysics } from './inertPhysics'

describe('the physics a host with no engine installs', () => {
  it('walks a character exactly where it asked to, and calls it grounded', () => {
    const port = createInertPhysics()

    const moved = port.moveCharacters([
      { body: 'walker', wanted: { x: 1, y: -2, z: 3 }, facing: null },
    ])

    expect(moved).toEqual([{ body: 'walker', moved: { x: 1, y: -2, z: 3 }, grounded: true }])
  })

  it('takes every body it is offered and moves none of them', () => {
    const port = createInertPhysics()

    expect(port.add([])).toEqual([])
    port.step(1 / 60)

    expect(port.poses()).toEqual([])
    expect(port.contacts()).toEqual([])
  })
})
