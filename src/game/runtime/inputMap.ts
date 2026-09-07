// SPDX-License-Identifier: MIT

import { isRecord } from '../guards'

/**
 * What a control map IS, and how one is read — the source, not a copy.
 *
 * 🛑 It lives HERE and not in `@shared/domain/`, and the direction is the whole point: this tree
 * ships MIT inside an exported game, the rest of the repository is PolyForm Noncommercial, and
 * MIT going INTO PolyForm is fine where the reverse is not. Written the other way round, the game
 * had to keep its own copy of the types, the parser, the presets and the completion — around 300
 * lines, and three guards reading both sides to refuse a drift they could not prevent.
 *
 * The studio adds the half a player never sees: a reader that THROWS rather than answering `null`
 * (`@shared/domain/inputMap.ts`), and the two presets only the studio plays — see `inputPresets`.
 */
export const INPUT_MAP_VERSION = 2

export type InputActionKind = 'button' | 'axis1' | 'axis2'

export type KeyboardBinding = {
  device: 'keyboard'
  code: string
  axis?: 'x' | 'y'
  scale?: number
}

export type MouseBinding = {
  device: 'mouse'
  control: 'primary'
}

export type GamepadControl =
  | 'leftStick'
  | 'rightStick'
  | 'leftStickX'
  | 'leftStickY'
  | 'rightStickX'
  | 'rightStickY'
  | 'south'
  | 'east'
  | 'west'
  | 'north'
  | 'leftShoulder'
  | 'rightShoulder'
  | 'leftTrigger'
  | 'rightTrigger'
  | 'select'
  | 'start'
  | 'leftStickButton'
  | 'rightStickButton'
  | 'dpadUp'
  | 'dpadDown'
  | 'dpadLeft'
  | 'dpadRight'
  | 'home'

export type GamepadBinding = {
  device: 'gamepad'
  control: GamepadControl
  deadZone?: number
  invert?: boolean
  scale?: number
}

export type InputBinding = KeyboardBinding | MouseBinding | GamepadBinding

export type InputAction = {
  id: string
  kind: InputActionKind
  bindings: readonly InputBinding[]
}

export type InputMap = {
  version: number
  id: string
  priority: number
  defaultActive: boolean
  actions: readonly InputAction[]
}

const SUPPORTED_GAMEPAD =
  /^(?:leftStick|rightStick)(?:X|Y|Button)?$|^(?:south|east|west|north|leftShoulder|rightShoulder|leftTrigger|rightTrigger|select|start|dpadUp|dpadDown|dpadLeft|dpadRight|home)$/

const isGamepadControl = (value: unknown): value is GamepadControl =>
  typeof value === 'string' && SUPPORTED_GAMEPAD.test(value)

export const isInputActionKind = (value: unknown): value is InputActionKind =>
  value === 'button' || value === 'axis1' || value === 'axis2'

const optionalNumber = (value: unknown): value is number | undefined =>
  value === undefined || (typeof value === 'number' && Number.isFinite(value))

const deadZone = (value: unknown): value is number =>
  typeof value === 'number' && value >= 0 && value < 1

/** One binding, or `null` for anything a device cannot answer. `@shared/` is what turns it into a throw. */
export function inputBindingOrNull(value: unknown): InputBinding | null {
  if (!isRecord(value)) return null
  if (value.device === 'keyboard') return keyboardOf(value)
  if (value.device === 'mouse')
    return value.control === 'primary' ? { device: 'mouse', control: 'primary' } : null
  if (value.device === 'gamepad') return gamepadOf(value)
  return null
}

function keyboardOf(value: Record<string, unknown>): KeyboardBinding | null {
  if (typeof value.code !== 'string' || value.code.length === 0) return null
  if (value.axis !== undefined && value.axis !== 'x' && value.axis !== 'y') return null
  if (!optionalNumber(value.scale)) return null
  return {
    device: 'keyboard',
    code: value.code,
    ...(value.axis === undefined ? {} : { axis: value.axis }),
    ...(value.scale === undefined ? {} : { scale: value.scale }),
  }
}

function gamepadOf(value: Record<string, unknown>): GamepadBinding | null {
  if (!isGamepadControl(value.control)) return null
  if (value.deadZone !== undefined && !deadZone(value.deadZone)) return null
  if (value.invert !== undefined && typeof value.invert !== 'boolean') return null
  if (!optionalNumber(value.scale)) return null
  return {
    device: 'gamepad',
    control: value.control,
    ...(value.deadZone === undefined ? {} : { deadZone: value.deadZone }),
    ...(value.invert === undefined ? {} : { invert: value.invert }),
    ...(value.scale === undefined ? {} : { scale: value.scale }),
  }
}

function isAxisBinding(binding: InputBinding): boolean {
  return (
    (binding.device === 'keyboard' &&
      (binding.axis !== undefined || binding.scale !== undefined)) ||
    (binding.device === 'gamepad' &&
      (binding.control.endsWith('Stick') ||
        binding.control.endsWith('StickX') ||
        binding.control.endsWith('StickY')))
  )
}

/** Whether a binding can answer for an action of this kind — read by the game and by the studio. */
export function inputBindingFits(kind: InputActionKind, binding: InputBinding): boolean {
  if (kind === 'button') return !isAxisBinding(binding)
  if (binding.device === 'mouse') return false
  if (kind === 'axis1') {
    if (binding.device === 'keyboard') return binding.axis === undefined
    // Anything but a TWO-WAY stick: a button pushes one way, which is what a half-axis is — and
    // a rudder on the shoulders was refused by a rule that only knew the word « Trigger ».
    return binding.control !== 'leftStick' && binding.control !== 'rightStick'
  }
  if (binding.device === 'keyboard') return binding.axis !== undefined
  return binding.control === 'leftStick' || binding.control === 'rightStick'
}
