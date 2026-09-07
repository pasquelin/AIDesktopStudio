// SPDX-License-Identifier: MIT

import { INPUT_MAP_VERSION, type InputMap, type KeyboardBinding } from '@shared/domain/inputMap'

/** The four keys and the four arrows a walker and a machine both answer, as one half-axis each. */
function keyAxis(negative: readonly string[], positive: readonly string[]): KeyboardBinding[] {
  return [
    ...negative.map((code): KeyboardBinding => ({ device: 'keyboard', code, scale: -1 })),
    ...positive.map((code): KeyboardBinding => ({ device: 'keyboard', code, scale: 1 })),
  ]
}

function keyVector(
  negative: readonly string[],
  positive: readonly string[],
  axis: 'x' | 'y',
): KeyboardBinding[] {
  return keyAxis(negative, positive).map(binding => ({ ...binding, axis }))
}

const LEFT = ['KeyA', 'ArrowLeft']
const RIGHT = ['KeyD', 'ArrowRight']
const AHEAD = ['KeyW', 'ArrowUp']
const BACK = ['KeyS', 'ArrowDown']

/**
 * 🛑 COPIED from `@shared/domain/inputPresets`: this tree is MIT and ships without the rest, so a
 * VALUE taken from `@shared/` would carry PolyForm code into an exported game. `inputDefaults.
 * test.ts` ships nowhere, reads both, and refuses a drift.
 */
const DEFAULTS: readonly InputMap[] = [
  {
    version: INPUT_MAP_VERSION,
    id: 'character',
    priority: 0,
    defaultActive: true,
    actions: [
      {
        id: 'move',
        kind: 'axis2',
        bindings: [
          ...keyVector(LEFT, RIGHT, 'x'),
          // Ahead is NEGATIVE on y, which is what a stick pushed forward reads — `paceInto` turns
          // it back the once.
          ...keyVector(AHEAD, BACK, 'y'),
          { device: 'gamepad', control: 'leftStick' },
        ],
      },
      { id: 'look', kind: 'axis2', bindings: [{ device: 'gamepad', control: 'rightStick' }] },
      {
        id: 'jump',
        kind: 'button',
        bindings: [
          { device: 'keyboard', code: 'Space' },
          { device: 'gamepad', control: 'south' },
        ],
      },
      {
        id: 'run',
        kind: 'button',
        bindings: [
          { device: 'keyboard', code: 'ShiftLeft' },
          { device: 'keyboard', code: 'ShiftRight' },
          { device: 'gamepad', control: 'leftStickButton' },
        ],
      },
      {
        id: 'interact',
        kind: 'button',
        bindings: [
          { device: 'keyboard', code: 'KeyE' },
          { device: 'gamepad', control: 'west' },
        ],
      },
    ],
  },
  {
    version: INPUT_MAP_VERSION,
    id: 'vehicle',
    priority: 10,
    // Active with `character`: no action name is shared, and a driver's body walks nowhere while
    // it is being carried — see `possession.ts`.
    defaultActive: true,
    actions: [
      {
        id: 'steer',
        kind: 'axis1',
        bindings: [...keyAxis(LEFT, RIGHT), { device: 'gamepad', control: 'leftStickX' }],
      },
      {
        id: 'accelerate',
        kind: 'axis1',
        bindings: [
          ...AHEAD.map((code): KeyboardBinding => ({ device: 'keyboard', code, scale: 1 })),
          { device: 'gamepad', control: 'rightTrigger' },
        ],
      },
      {
        id: 'brake',
        kind: 'axis1',
        bindings: [
          ...BACK.map((code): KeyboardBinding => ({ device: 'keyboard', code, scale: 1 })),
          { device: 'gamepad', control: 'leftTrigger' },
        ],
      },
      {
        id: 'handBrake',
        kind: 'button',
        bindings: [
          { device: 'keyboard', code: 'Space' },
          { device: 'gamepad', control: 'south' },
        ],
      },
      {
        id: 'exit',
        kind: 'button',
        bindings: [
          { device: 'keyboard', code: 'KeyF' },
          { device: 'gamepad', control: 'west' },
        ],
      },
    ],
  },
  {
    version: INPUT_MAP_VERSION,
    id: 'flight',
    priority: 10,
    defaultActive: true,
    actions: [
      // Pulled back is nose UP, which is what the arrows already said and what a stick pulled
      // towards the pilot reads as: positive y, no inversion.
      {
        id: 'pitch',
        kind: 'axis1',
        bindings: [...keyAxis(AHEAD, BACK), { device: 'gamepad', control: 'leftStickY' }],
      },
      {
        id: 'roll',
        kind: 'axis1',
        bindings: [...keyAxis(LEFT, RIGHT), { device: 'gamepad', control: 'leftStickX' }],
      },
      {
        id: 'yaw',
        kind: 'axis1',
        bindings: [
          ...keyAxis(['KeyQ'], ['KeyE']),
          { device: 'gamepad', control: 'leftShoulder', scale: -1 },
          { device: 'gamepad', control: 'rightShoulder', scale: 1 },
        ],
      },
      // A RATE, not a position: the lever is nudged up and down and stays where it was left,
      // which is what the keyboard already did and what a trigger held forward now does too.
      {
        id: 'throttle',
        kind: 'axis1',
        bindings: [
          ...keyAxis(['ControlLeft'], ['ShiftLeft']),
          { device: 'gamepad', control: 'leftTrigger', scale: -1 },
          { device: 'gamepad', control: 'rightTrigger', scale: 1 },
        ],
      },
    ],
  },
]

/**
 * The maps given, completed by the contexts they leave undefined — a gamepad and a keyboard reach
 * the built-in controllers with no file and no script. What is given always wins.
 *
 * 🛑 Handed out as they ARE: `createInputControls` clones what it keeps, and cloning twice hid
 * which of the two owned the copy.
 */
export function withDefaultInputMaps(maps: readonly InputMap[]): readonly InputMap[] {
  const declared = new Set(maps.map(map => map.id))
  return [...maps.map(completed), ...DEFAULTS.filter(map => !declared.has(map.id))]
}

/**
 * 🛑 Completed action by ACTION: a map written before an action existed — `run`, `handBrake`,
 * `yaw` — would otherwise leave the built-in controller reading nothing, and a car that drove
 * yesterday would be dead with no word.
 */
function completed(map: InputMap): InputMap {
  const built = DEFAULTS.find(one => one.id === map.id)
  if (!built) return map
  const kinds = new Map(built.actions.map(action => [action.id, action]))
  // 🛑 The KIND is the built-in's, whatever the file says: values are keyed by id alone, so a
  // `move` written as `axis1` made `axis2('move')` answer zero and the character stopped walking,
  // with nothing said. A binding of the wrong shape reads as rest; the controller stays alive.
  const kept = map.actions.map(action => {
    const one = kinds.get(action.id)
    return one && one.kind !== action.kind ? one : action
  })
  const declared = new Set(map.actions.map(action => action.id))
  const missing = built.actions.filter(action => !declared.has(action.id))
  return { ...map, ...upgraded(map, built), actions: [...kept, ...missing] }
}

/**
 * 🛑 What a map written before version 2 does not answer: those files predate the day driving and
 * flying became active by default, so a project that had made its own carried `false` and its
 * plane responded to NOTHING, with no word. A map of the current version is left as it is.
 */
function upgraded(map: InputMap, built: InputMap): Partial<InputMap> {
  return map.version === INPUT_MAP_VERSION
    ? {}
    : { version: INPUT_MAP_VERSION, defaultActive: built.defaultActive }
}
