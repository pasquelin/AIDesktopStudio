// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import type { InputMap } from './inputMap'
import { resolveInputMaps } from './inputMaps'
import { standardGamepad } from './input-fixtures'

const character: InputMap = {
  version: 1,
  id: 'character',
  priority: 0,
  defaultActive: true,
  actions: [
    { id: 'jump', kind: 'button', bindings: [{ device: 'keyboard', code: 'Space' }] },
    { id: 'move', kind: 'axis2', bindings: [{ device: 'gamepad', control: 'leftStick' }] },
  ],
}

const vehicle: InputMap = {
  version: 1,
  id: 'vehicle',
  priority: 10,
  defaultActive: false,
  actions: [
    { id: 'jump', kind: 'button', bindings: [{ device: 'keyboard', code: 'KeyF' }] },
    { id: 'accelerate', kind: 'axis1', bindings: [{ device: 'gamepad', control: 'rightTrigger' }] },
  ],
}

describe('input mapping contexts', () => {
  it('lets the highest active context own a duplicated action', () => {
    const resolved = resolveInputMaps([character, vehicle], ['character', 'vehicle'], {
      held: ['Space', 'KeyF'],
      gamepads: [],
    })

    expect(resolved.button('jump')).toBe(true)
    expect(resolved.button('accelerate')).toBe(false)
    expect(resolved.axis2('move')).toEqual({ x: 0, y: 0 })
  })

  it('reads a standard gamepad axis with its dead zone removed', () => {
    const resolved = resolveInputMaps([character], ['character'], {
      held: [],
      gamepads: [
        {
          id: 'DualSense',
          index: 0,
          mapping: 'standard',
          axes: [0.1, -0.75],
          buttons: [],
        },
      ],
    })

    expect(resolved.axis2('move')).toEqual({ x: 0, y: -0.75 })
  })

  it('does not guess button indices for a non-standard controller mapping', () => {
    const resolved = resolveInputMaps([vehicle], ['vehicle'], {
      held: [],
      gamepads: [{ id: 'Custom', index: 0, mapping: '', axes: [], buttons: [1, 1, 1, 1] }],
    })

    expect(resolved.button('jump')).toBe(false)
  })

  it('combines keyboard directions into a two-dimensional action', () => {
    const map: InputMap = {
      ...character,
      actions: [
        {
          id: 'move',
          kind: 'axis2',
          bindings: [
            { device: 'keyboard', code: 'KeyA', axis: 'x', scale: -1 },
            { device: 'keyboard', code: 'KeyD', axis: 'x', scale: 1 },
            { device: 'keyboard', code: 'KeyW', axis: 'y', scale: -1 },
          ],
        },
      ],
    }

    const resolved = resolveInputMaps([map], ['character'], {
      held: ['KeyD', 'KeyW'],
      gamepads: [],
    })

    expect(resolved.axis2('move')).toEqual({ x: 1, y: -1 })
  })

  it('reads the primary pointer as a button action', () => {
    const map: InputMap = {
      ...character,
      actions: [
        { id: 'fire', kind: 'button', bindings: [{ device: 'mouse', control: 'primary' }] },
      ],
    }

    const resolved = resolveInputMaps([map], ['character'], {
      held: [],
      gamepads: [],
      pointer: { x: 2, y: 3, down: true },
    })

    expect(resolved.button('fire')).toBe(true)
  })
})

describe('an axis read off keys and a stick together', () => {
  const walking: InputMap = {
    version: 1,
    id: 'character',
    priority: 0,
    defaultActive: true,
    actions: [
      {
        id: 'steer',
        kind: 'axis1',
        bindings: [
          { device: 'keyboard', code: 'KeyA', scale: -1 },
          { device: 'keyboard', code: 'KeyD', scale: 1 },
          { device: 'gamepad', control: 'leftStickX' },
        ],
      },
    ],
  }

  const read = (held: readonly string[], x = 0): number =>
    resolveInputMaps([walking], ['character'], {
      held,
      gamepads: [{ id: 'pad', index: 0, mapping: 'standard', axes: [x, 0, 0, 0], buttons: [] }],
    }).axis('steer')

  it('cancels two opposite keys held, where the strongest alone kept the first for ever', () => {
    expect(read(['KeyA', 'KeyD'])).toBe(0)
    expect(read(['KeyA'])).toBe(-1)
    expect(read(['KeyD'])).toBe(1)
  })

  it('lets the stick win when it is pushed further than the keys ask', () => {
    expect(read([], 0.6)).toBeCloseTo(0.6)
    expect(read(['KeyA'], 0.6)).toBe(-1)
    expect(read(['KeyA', 'KeyD'], 0.6)).toBeCloseTo(0.6)
  })
})

describe('two controllers pushing one axis', () => {
  const moving: readonly InputMap[] = [
    {
      version: 1,
      id: 'character',
      priority: 0,
      defaultActive: true,
      actions: [
        {
          id: 'steer',
          kind: 'axis1',
          bindings: [
            { device: 'keyboard', code: 'KeyA', scale: -1 },
            { device: 'gamepad', control: 'leftStickX' },
          ],
        },
      ],
    },
  ]

  const steering = (input: Parameters<typeof resolveInputMaps>[2]): number =>
    resolveInputMaps(moving, ['character'], input).axis('steer')

  /** 🛑 `stronger` kept the FIRST of two equal pushes: the pad listed first always won. */
  it('cancels out when they push the opposite way with the same force', () => {
    expect(
      steering({
        held: [],
        gamepads: [standardGamepad({ leftX: 0.9 }), standardGamepad({ leftX: -0.9 })],
      }),
    ).toBe(0)
  })

  it('still keeps the stronger of the two', () => {
    expect(
      steering({
        held: [],
        gamepads: [standardGamepad({ leftX: 0.4 }), standardGamepad({ leftX: -0.9 })],
      }),
    ).toBeCloseTo(-0.9, 5)
  })

  /**
   * 🛑 Scoped to CONTROLLERS: between a key and a stick the strongest still wins outright, or a
   * key held with a stick pushed full the other way would answer nothing at all.
   */
  it('does not cancel a held key against a stick pushed the other way', () => {
    expect(steering({ held: ['KeyA'], gamepads: [standardGamepad({ leftX: 1 })] })).toBe(-1)
  })
})
