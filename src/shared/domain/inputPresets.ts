import { INPUT_MAP_VERSION, type InputMap, type KeyboardBinding } from './inputMap'

export type InputPresetId = 'studio' | 'character' | 'vehicle' | 'flight' | 'menu'

export const INPUT_PRESET_IDS: readonly InputPresetId[] = [
  'studio',
  'character',
  'vehicle',
  'flight',
  'menu',
]

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

const PRESETS: Record<InputPresetId, InputMap> = {
  // 🛑 The five the studio's own focus navigation reads. `next` and `previous` are BUTTONS: a
  // two-way stick is the only thing an `axis2` takes, so the d-pad could not live on `navigate`
  // — and it is what a person navigating a panel reaches for first.
  studio: {
    version: INPUT_MAP_VERSION,
    id: 'studio',
    priority: 100,
    defaultActive: true,
    actions: [
      { id: 'navigate', kind: 'axis2', bindings: [{ device: 'gamepad', control: 'leftStick' }] },
      {
        id: 'next',
        kind: 'button',
        bindings: [
          { device: 'gamepad', control: 'dpadDown' },
          { device: 'gamepad', control: 'dpadRight' },
        ],
      },
      {
        id: 'previous',
        kind: 'button',
        bindings: [
          { device: 'gamepad', control: 'dpadUp' },
          { device: 'gamepad', control: 'dpadLeft' },
        ],
      },
      { id: 'confirm', kind: 'button', bindings: [{ device: 'gamepad', control: 'south' }] },
      { id: 'back', kind: 'button', bindings: [{ device: 'gamepad', control: 'east' }] },
    ],
  },
  character: {
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
  vehicle: {
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
  flight: {
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
  menu: {
    version: INPUT_MAP_VERSION,
    id: 'menu',
    priority: 100,
    defaultActive: false,
    actions: [
      {
        id: 'confirm',
        kind: 'button',
        bindings: [
          { device: 'keyboard', code: 'Enter' },
          { device: 'gamepad', control: 'south' },
        ],
      },
      {
        id: 'back',
        kind: 'button',
        bindings: [
          { device: 'keyboard', code: 'Escape' },
          { device: 'gamepad', control: 'east' },
        ],
      },
    ],
  },
}

export function inputMapPreset(id: InputPresetId): InputMap {
  return PRESETS[id]
}

/**
 * A written map, completed action by ACTION from the preset it names.
 *
 * 🛑 A map a project wrote before an action existed — or one rebinding a single action — would
 * otherwise REPLACE the preset: `axis2`/`button` answer zero for an action nobody declared, and
 * the studio's own navigation lost confirm and back with no word. Mirrors `withDefaultInputMaps`
 * of the game runtime, which cannot be imported here — that tree ships MIT and this one does not.
 */
export function completedInputMap(map: InputMap): InputMap {
  if (!INPUT_PRESET_IDS.includes(map.id as InputPresetId)) return map
  const preset = PRESETS[map.id as InputPresetId]
  const kinds = new Map(preset.actions.map(action => [action.id, action]))
  // 🛑 The KIND is the preset's, whatever the file says: values are keyed by id alone, so an
  // action written under another kind answers zero to whoever reads it, and says nothing.
  const kept = map.actions.map(action => {
    const one = kinds.get(action.id)
    return one && one.kind !== action.kind ? one : action
  })
  const declared = new Set(map.actions.map(action => action.id))
  const missing = preset.actions.filter(action => !declared.has(action.id))
  const upgraded =
    map.version === INPUT_MAP_VERSION
      ? {}
      : { version: INPUT_MAP_VERSION, defaultActive: preset.defaultActive }
  return { ...map, ...upgraded, actions: [...kept, ...missing] }
}
