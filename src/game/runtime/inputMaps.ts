// SPDX-License-Identifier: MIT

import type {
  GamepadBinding,
  GamepadControl,
  InputAction,
  InputBinding,
  InputMap,
} from './inputMap'
import type { GamepadState, InputState } from '../ports/inputPort'
import { clamp } from '../numeric'

type InputVector = { x: number; y: number }

/** What a map is resolved against: the reading itself, minus what names no binding. */
export type RawInput = Pick<InputState, 'held' | 'gamepads'> &
  Partial<Pick<InputState, 'pointer' | 'pressed'>>

export type ResolvedInput = {
  button: (id: string) => boolean
  axis: (id: string) => number
  axis2: (id: string) => InputVector
  values: Readonly<Record<string, InputActionValue>>
}

export type InputActionValue = boolean | number | InputVector

const ZERO: InputVector = { x: 0, y: 0 }
export const DEFAULT_GAMEPAD_DEAD_ZONE = 0.15

/**
 * The active maps, lowest priority first — the order they are folded in, so the highest priority
 * writes last and wins. SEPARATE from the resolution because it only changes at a rebind or a
 * push, while the resolution runs once a step: `inputActions` holds this answer between steps.
 */
export function orderedInputMaps(
  maps: readonly InputMap[],
  active: readonly string[],
): readonly InputMap[] {
  const activeIds = new Set(active)
  // No `slice` before the sort: `filter` already answers a new array.
  return maps
    .filter(map => activeIds.has(map.id))
    .sort((one, other) => one.priority - other.priority)
}

export function resolveInputMaps(
  maps: readonly InputMap[],
  active: readonly string[],
  input: RawInput,
): ResolvedInput {
  return resolveOrderedInputMaps(orderedInputMaps(maps, active), input)
}

export function resolveOrderedInputMaps(
  ordered: readonly InputMap[],
  input: RawInput,
): ResolvedInput {
  const values: Record<string, InputActionValue> = {}

  for (const map of ordered) {
    for (const action of map.actions) values[action.id] = valueOf(action, input)
  }

  return {
    button: id => values[id] === true,
    axis: id => {
      const value = values[id]
      return typeof value === 'number' ? value : 0
    },
    axis2: id => {
      const value = values[id]
      return isVector(value) ? value : ZERO
    },
    values,
  }
}

function valueOf(action: InputAction, input: RawInput): InputActionValue {
  if (action.kind === 'button') return action.bindings.some(binding => buttonOf(binding, input))
  if (action.kind === 'axis1') return axisValueOf(action, input)
  return vectorValueOf(action, input)
}

/**
 * 🛑 Half-axes SUM and a stick wins by magnitude. Two opposite halves held must cancel, which
 * `stronger` alone never did: it kept the first of them for ever.
 */
function axisValueOf(action: InputAction, input: RawInput): number {
  let halves = 0
  let axes = 0
  for (const binding of action.bindings) {
    const value = axisOf(binding, input)
    if (isHalfAxis(binding)) halves += value
    else axes = stronger(axes, value)
  }
  return stronger(clamp(halves, -1, 1), axes)
}

function vectorValueOf(action: InputAction, input: RawInput): InputVector {
  const halves: InputVector = { x: 0, y: 0 }
  let axes: InputVector = ZERO
  for (const binding of action.bindings) {
    const value = vectorOf(binding, input)
    if (isHalfAxis(binding)) {
      halves.x += value.x
      halves.y += value.y
    } else axes = strongerVector(axes, value)
  }
  return strongerVector({ x: clamp(halves.x, -1, 1), y: clamp(halves.y, -1, 1) }, axes)
}

/**
 * Whether a binding can only push ONE way — a key, a button, a trigger. The seam is the control,
 * never the device: two triggers scaled apart are a pair of halves exactly as two keys are, and
 * reading `device` alone gave a plane holding both of them full throttle BACKWARDS.
 */
function isHalfAxis(binding: InputBinding): boolean {
  if (binding.device !== 'gamepad') return true
  return BUTTON_INDEX.has(binding.control)
}

function buttonOf(binding: InputAction['bindings'][number], input: RawInput): boolean {
  if (binding.device === 'keyboard') return input.held.includes(binding.code)
  if (binding.device === 'mouse')
    return binding.control === 'primary' && input.pointer?.down === true
  return axisOf(binding, input) > 0.5
}

function axisOf(binding: InputAction['bindings'][number], input: RawInput): number {
  if (binding.device === 'keyboard')
    return input.held.includes(binding.code) ? (binding.scale ?? 1) : 0
  if (binding.device !== 'gamepad') return 0
  const raw = (input.gamepads ?? []).reduce(
    (strongest, gamepad) => strongestAcross(strongest, rawGamepadAxis(gamepad, binding)),
    0,
  )
  return shaped(raw, binding)
}

/** Dead zone, then invert, then scale — the one order an axis and both halves of a stick share. */
function shaped(raw: number, binding: GamepadBinding): number {
  if (Math.abs(raw) <= (binding.deadZone ?? DEFAULT_GAMEPAD_DEAD_ZONE)) return 0
  return (binding.invert ? -raw : raw) * (binding.scale ?? 1)
}

function vectorOf(binding: InputAction['bindings'][number], input: RawInput): InputVector {
  if (binding.device === 'keyboard') {
    if (!input.held.includes(binding.code)) return ZERO
    const value = binding.scale ?? 1
    return binding.axis === 'x' ? { x: value, y: 0 } : { x: 0, y: value }
  }
  if (binding.device !== 'gamepad') return ZERO
  const vector = (input.gamepads ?? []).reduce<InputVector>((strongest, gamepad) => {
    const raw = rawGamepadVector(gamepad, binding)
    return { x: strongestAcross(strongest.x, raw.x), y: strongestAcross(strongest.y, raw.y) }
  }, ZERO)
  return { x: shaped(vector.x, binding), y: shaped(vector.y, binding) }
}

function rawGamepadAxis(gamepad: GamepadState, binding: GamepadBinding): number {
  if (gamepad.mapping !== 'standard') return 0
  const index = BUTTON_INDEX.get(binding.control)
  if (index !== undefined) return gamepad.buttons[index] ?? 0
  const axis = AXIS_INDEX.get(binding.control)
  return axis === undefined ? 0 : (gamepad.axes[axis] ?? 0)
}

function rawGamepadVector(gamepad: GamepadState, binding: GamepadBinding): InputVector {
  if (gamepad.mapping !== 'standard') return ZERO
  if (binding.control !== 'leftStick' && binding.control !== 'rightStick') return ZERO
  const offset = binding.control === 'leftStick' ? 0 : 2
  return { x: gamepad.axes[offset] ?? 0, y: gamepad.axes[offset + 1] ?? 0 }
}

/** The standard mapping's stick order — exported so a caller names a control, never an index. */
export const GAMEPAD_AXES: readonly GamepadControl[] = [
  'leftStickX',
  'leftStickY',
  'rightStickX',
  'rightStickY',
]

/** The standard mapping's button order — exported so a suite names a control, never an index. */
export const GAMEPAD_BUTTONS: readonly GamepadControl[] = [
  'south',
  'east',
  'west',
  'north',
  'leftShoulder',
  'rightShoulder',
  'leftTrigger',
  'rightTrigger',
  'select',
  'start',
  'leftStickButton',
  'rightStickButton',
  'dpadUp',
  'dpadDown',
  'dpadLeft',
  'dpadRight',
  'home',
]

// Built once: these two are read per gamepad binding per step, and a scan of seventeen entries
// through a closure was paid sixty times a second for an answer that never changes.
const BUTTON_INDEX = new Map(GAMEPAD_BUTTONS.map((control, index) => [control, index]))
const AXIS_INDEX = new Map(GAMEPAD_AXES.map((control, index) => [control, index]))

function stronger(one: number, other: number): number {
  return Math.abs(other) > Math.abs(one) ? other : one
}

/**
 * 🛑 Across CONTROLLERS only, where `stronger` kept the first of two equal pushes: two people
 * pushing a stick the opposite way each cancel out rather than letting the one listed first win.
 * Not used between a key and a stick — there a held key and a full stick backwards must not
 * silently answer nothing.
 */
function strongestAcross(one: number, other: number): number {
  if (Math.abs(other) === Math.abs(one)) return one === -other ? 0 : one
  return Math.abs(other) > Math.abs(one) ? other : one
}

function strongerVector(one: InputVector, other: InputVector): InputVector {
  return { x: stronger(one.x, other.x), y: stronger(one.y, other.y) }
}

function isVector(value: InputActionValue | undefined): value is InputVector {
  return typeof value === 'object' && value !== null
}
