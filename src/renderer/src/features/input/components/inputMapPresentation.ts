// SPDX-License-Identifier: MIT
import type { InputActionKind, InputBinding } from '@shared/domain/inputMap'
import { INPUT_PRESET_IDS, inputMapPreset } from '@shared/domain/inputPresets'

export function inputBindingLabel(binding: InputBinding): string {
  if (binding.device === 'keyboard') return binding.code
  return binding.control
}

/**
 * The actions the built-in contexts declare, which are the only ones the studio can explain in
 * words. DERIVED from the presets rather than listed beside them: a preset gaining an action
 * gains its sentence, and the translation guard reads this very list to check it was written.
 */
export const DESCRIBED_ACTION_IDS: readonly string[] = [
  ...new Set(INPUT_PRESET_IDS.flatMap(id => inputMapPreset(id).actions.map(action => action.id))),
]

/**
 * What an action DOES, in one sentence — the answer to the question this editor never used to
 * take: `move` and `handBrake` were names on screen and nothing more.
 *
 * A name of the project's own gets the general answer, which is the true one: the studio cannot
 * know what `castSpell` does, only that a script reads it.
 */
export function inputActionKey(id: string): string {
  return DESCRIBED_ACTION_IDS.includes(id)
    ? `game.inputMap.action.${id}`
    : 'game.inputMap.action.custom'
}

/**
 * The binding a NEW row starts on. One factory rather than two, and that is a fix: the kind
 * change and the device change each had their own, and they disagreed — a two-axis action born
 * of a kind change took `Space`, one born of a device change took `KeyD` on the x axis.
 *
 * The default device is what the action is FOR: a key for a button, a stick for an axis.
 */
export function defaultInputBinding(
  kind: InputActionKind,
  device: InputBinding['device'] = kind === 'button' ? 'keyboard' : 'gamepad',
): InputBinding {
  if (device === 'mouse') return { device: 'mouse', control: 'primary' }
  if (device === 'gamepad') {
    if (kind === 'button') return { device: 'gamepad', control: 'south' }
    if (kind === 'axis1') return { device: 'gamepad', control: 'leftStickX' }
    return { device: 'gamepad', control: 'leftStick' }
  }
  if (kind === 'button') return { device: 'keyboard', code: 'Space' }
  if (kind === 'axis1') return { device: 'keyboard', code: 'KeyD', scale: 1 }
  return { device: 'keyboard', code: 'KeyD', axis: 'x', scale: 1 }
}
