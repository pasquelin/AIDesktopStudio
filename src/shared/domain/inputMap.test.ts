import { describe, expect, it } from 'vitest'
import { inputMapOf } from './inputMap'

describe('input maps', () => {
  it('refuses a non-finite gamepad dead zone', () => {
    expect(() =>
      inputMapOf({
        version: 1,
        id: 'character',
        priority: 0,
        defaultActive: true,
        actions: [
          {
            id: 'jump',
            kind: 'button',
            bindings: [{ device: 'gamepad', control: 'south', deadZone: Number.NaN }],
          },
        ],
      }),
    ).toThrow()
  })

  it('reads a versioned context with typed actions', () => {
    expect(
      inputMapOf({
        version: 1,
        id: 'character',
        priority: 0,
        defaultActive: true,
        actions: [
          { id: 'jump', kind: 'button', bindings: [{ device: 'keyboard', code: 'Space' }] },
          {
            id: 'move',
            kind: 'axis2',
            bindings: [{ device: 'gamepad', control: 'leftStick' }],
          },
        ],
      }),
    ).toEqual({
      version: 1,
      id: 'character',
      priority: 0,
      defaultActive: true,
      actions: [
        { id: 'jump', kind: 'button', bindings: [{ device: 'keyboard', code: 'Space' }] },
        { id: 'move', kind: 'axis2', bindings: [{ device: 'gamepad', control: 'leftStick' }] },
      ],
    })
  })

  it('refuses an axis binding on a button action', () => {
    expect(() =>
      inputMapOf({
        version: 1,
        id: 'character',
        priority: 0,
        defaultActive: true,
        actions: [
          { id: 'jump', kind: 'button', bindings: [{ device: 'gamepad', control: 'leftStick' }] },
        ],
      }),
    ).toThrow()
  })

  it('refuses a single stick axis on a button action', () => {
    expect(() =>
      inputMapOf({
        version: 1,
        id: 'vehicle',
        priority: 0,
        defaultActive: true,
        actions: [
          {
            id: 'accelerate',
            kind: 'button',
            bindings: [{ device: 'gamepad', control: 'leftStickY' }],
          },
        ],
      }),
    ).toThrow()
  })

  it('reads a scaled keyboard direction for an axis action', () => {
    const map = inputMapOf({
      version: 1,
      id: 'character',
      priority: 0,
      defaultActive: true,
      actions: [
        {
          id: 'move',
          kind: 'axis2',
          bindings: [{ device: 'keyboard', code: 'KeyA', axis: 'x', scale: -1 }],
        },
      ],
    })

    expect(map.actions[0]?.bindings[0]).toEqual({
      device: 'keyboard',
      code: 'KeyA',
      axis: 'x',
      scale: -1,
    })
  })

  it.each([
    ['axis1', { device: 'gamepad', control: 'leftStick' }],
    ['axis2', { device: 'gamepad', control: 'leftStickX' }],
    ['axis1', { device: 'mouse', control: 'primary' }],
  ])('refuses a %s binding the runtime cannot resolve', (kind, binding) => {
    expect(() =>
      inputMapOf({
        version: 1,
        id: 'invalid',
        priority: 0,
        defaultActive: true,
        actions: [{ id: 'move', kind, bindings: [binding] }],
      }),
    ).toThrow()
  })
})
