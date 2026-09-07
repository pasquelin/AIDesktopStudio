// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import { inputBindingFits, inputBindingOrNull, type InputBinding } from './inputMap'

/**
 * 🛑 The one reader of this format, which the studio WRAPS rather than copies.
 *
 * Written twice, the two had drifted: a non-boolean `invert` was DROPPED on one side and REFUSED
 * on the other, so the studio wrote a map the exported game discarded whole — and the player lost
 * every rebinding, silently.
 */
const READINGS: readonly (readonly [unknown, InputBinding | null])[] = [
  [null, null],
  ['leftStick', null],
  [{ device: 'pedal', control: 'primary' }, null],

  [{ device: 'keyboard' }, null],
  [{ device: 'keyboard', code: '' }, null],
  [
    { device: 'keyboard', code: 'Space' },
    { device: 'keyboard', code: 'Space' },
  ],
  [
    { device: 'keyboard', code: 'KeyA', axis: 'x' },
    { device: 'keyboard', code: 'KeyA', axis: 'x' },
  ],
  [{ device: 'keyboard', code: 'KeyA', axis: 'z' }, null],
  [
    { device: 'keyboard', code: 'KeyA', scale: -1 },
    { device: 'keyboard', code: 'KeyA', scale: -1 },
  ],
  [{ device: 'keyboard', code: 'KeyA', scale: Number.NaN }, null],

  [
    { device: 'mouse', control: 'primary' },
    { device: 'mouse', control: 'primary' },
  ],
  [{ device: 'mouse', control: 'secondary' }, null],

  [
    { device: 'gamepad', control: 'leftStick' },
    { device: 'gamepad', control: 'leftStick' },
  ],
  [
    { device: 'gamepad', control: 'leftStickX' },
    { device: 'gamepad', control: 'leftStickX' },
  ],
  [
    { device: 'gamepad', control: 'leftStickButton' },
    { device: 'gamepad', control: 'leftStickButton' },
  ],
  [
    { device: 'gamepad', control: 'south' },
    { device: 'gamepad', control: 'south' },
  ],
  [{ device: 'gamepad', control: 'touchpad' }, null],
  [
    { device: 'gamepad', control: 'leftTrigger', deadZone: 0.2 },
    { device: 'gamepad', control: 'leftTrigger', deadZone: 0.2 },
  ],
  // A dead zone of one silences the control it guards, and a negative one is not a zone.
  [{ device: 'gamepad', control: 'leftTrigger', deadZone: 1 }, null],
  [{ device: 'gamepad', control: 'leftTrigger', deadZone: -0.1 }, null],
  [
    { device: 'gamepad', control: 'leftStick', invert: true },
    { device: 'gamepad', control: 'leftStick', invert: true },
  ],
  [{ device: 'gamepad', control: 'leftStick', invert: 'yes' }, null],
  [
    { device: 'gamepad', control: 'leftStick', scale: 2 },
    { device: 'gamepad', control: 'leftStick', scale: 2 },
  ],
  [{ device: 'gamepad', control: 'leftStick', scale: Number.POSITIVE_INFINITY }, null],
]

describe('reading one binding out of a written map', () => {
  it('answers a shape a device can hold, and nothing else', () => {
    const read = READINGS.map(([value]) => inputBindingOrNull(value))

    expect(read).toEqual(READINGS.map(([, expected]) => expected))
  })

  // An empty result would prove nothing if every candidate were refused.
  it('found something to read among them', () => {
    expect(READINGS.filter(([, expected]) => expected !== null).length).toBeGreaterThan(10)
  })
})

describe('whether a binding can answer for an action', () => {
  const fits = (kind: 'button' | 'axis1' | 'axis2', value: unknown): boolean => {
    const binding = inputBindingOrNull(value)
    return binding !== null && inputBindingFits(kind, binding)
  }

  it('gives a button everything but an axis — a stick BUTTON being a button', () => {
    expect(fits('button', { device: 'keyboard', code: 'Space' })).toBe(true)
    expect(fits('button', { device: 'mouse', control: 'primary' })).toBe(true)
    expect(fits('button', { device: 'gamepad', control: 'south' })).toBe(true)
    expect(fits('button', { device: 'gamepad', control: 'leftStickButton' })).toBe(true)

    expect(fits('button', { device: 'keyboard', code: 'KeyA', axis: 'x' })).toBe(false)
    expect(fits('button', { device: 'keyboard', code: 'KeyA', scale: -1 })).toBe(false)
    expect(fits('button', { device: 'gamepad', control: 'leftStick' })).toBe(false)
    expect(fits('button', { device: 'gamepad', control: 'leftStickX' })).toBe(false)
  })

  // 🛑 Anything but a TWO-WAY stick: a button pushes one way, which is what a half-axis is — and
  // a rudder on the shoulders was refused by a rule that only knew the word « Trigger ».
  it('gives a one-way axis anything but a two-way stick, the shoulders included', () => {
    expect(fits('axis1', { device: 'keyboard', code: 'KeyA', scale: -1 })).toBe(true)
    expect(fits('axis1', { device: 'gamepad', control: 'leftStickX' })).toBe(true)
    expect(fits('axis1', { device: 'gamepad', control: 'leftTrigger' })).toBe(true)
    expect(fits('axis1', { device: 'gamepad', control: 'leftShoulder' })).toBe(true)

    expect(fits('axis1', { device: 'gamepad', control: 'leftStick' })).toBe(false)
    expect(fits('axis1', { device: 'keyboard', code: 'KeyA', axis: 'x' })).toBe(false)
    expect(fits('axis1', { device: 'mouse', control: 'primary' })).toBe(false)
  })

  it('gives a two-way axis a stick, or a key that names which way it pushes', () => {
    expect(fits('axis2', { device: 'gamepad', control: 'rightStick' })).toBe(true)
    expect(fits('axis2', { device: 'keyboard', code: 'KeyA', axis: 'x' })).toBe(true)

    expect(fits('axis2', { device: 'gamepad', control: 'leftStickX' })).toBe(false)
    expect(fits('axis2', { device: 'keyboard', code: 'Space' })).toBe(false)
    expect(fits('axis2', { device: 'mouse', control: 'primary' })).toBe(false)
  })
})
