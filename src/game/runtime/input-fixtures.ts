// SPDX-License-Identifier: MIT

import type { GamepadControl } from './inputMap'
import type { GamepadState, InputState } from '../ports/inputPort'
import { GAMEPAD_BUTTONS } from './inputMaps'

/**
 * One standard controller, its sticks and its buttons where a suite puts them. Controls are
 * NAMED: four suites wrote the button index by hand, and reordering the mapping left them green
 * measuring another button.
 */
export function standardGamepad(
  axes: Partial<Record<'leftX' | 'leftY' | 'rightX' | 'rightY', number>> = {},
  pressed: readonly GamepadControl[] = [],
): GamepadState {
  const held = new Set(pressed)
  return {
    id: 'pad',
    index: 0,
    mapping: 'standard',
    axes: [axes.leftX ?? 0, axes.leftY ?? 0, axes.rightX ?? 0, axes.rightY ?? 0],
    buttons: GAMEPAD_BUTTONS.map(control => (held.has(control as GamepadControl) ? 1 : 0)),
  }
}

/** A resting reading, with whatever the test wants to say over it. */
export function reading(over: Partial<InputState> = {}): InputState {
  return {
    held: [],
    pressed: [],
    released: [],
    pointer: { x: 0, y: 0, down: false },
    ...over,
  }
}
