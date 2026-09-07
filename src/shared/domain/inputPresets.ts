import { completedAgainst, PLAYED_INPUT_PRESETS } from '@game/runtime/inputDefaults'
import { INPUT_MAP_VERSION, type InputMap } from './inputMap'

export type InputPresetId = 'studio' | 'character' | 'vehicle' | 'flight' | 'menu'

export const INPUT_PRESET_IDS: readonly InputPresetId[] = [
  'studio',
  'character',
  'vehicle',
  'flight',
  'menu',
]

/**
 * The two contexts only the studio plays, beside the three the game runtime writes.
 *
 * 🛑 The played three are READ from `@game/`, never copied: that tree is MIT and this one is
 * PolyForm, so MIT comes here and the reverse would be the leak. Copied, the three blocks matched
 * character for character — comments included — and a guard watched for the drift instead.
 */
const STUDIO_PRESETS: Record<'studio' | 'menu', InputMap> = {
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

const PRESETS: Record<InputPresetId, InputMap> = { ...STUDIO_PRESETS, ...PLAYED_INPUT_PRESETS }

export function inputMapPreset(id: InputPresetId): InputMap {
  return PRESETS[id]
}

/**
 * A written map, completed action by ACTION from the preset it names.
 *
 * 🛑 A map a project wrote before an action existed — or one rebinding a single action — would
 * otherwise REPLACE the preset: `axis2`/`button` answer zero for an action nobody declared, and
 * the studio's own navigation lost confirm and back with no word. The completion itself is the
 * runtime's, read from there rather than written a second time.
 */
export function completedInputMap(map: InputMap): InputMap {
  const preset = PRESETS[map.id as InputPresetId]
  return preset ? completedAgainst(map, preset) : map
}
