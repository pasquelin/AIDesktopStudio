// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from 'vitest'
import {
  inputBindingFits,
  inputBindingOf,
  INPUT_MAP_VERSION,
  type GamepadControl,
  type InputActionKind,
  type InputBinding,
  type InputMap,
} from '@shared/domain/inputMap'
import { createInputControls } from './inputControls'
import { resolveInputMaps, type RawInput } from './inputMaps'

const defaults: readonly InputMap[] = [
  {
    version: INPUT_MAP_VERSION,
    id: 'character',
    priority: 0,
    defaultActive: true,
    actions: [{ id: 'jump', kind: 'button', bindings: [{ device: 'keyboard', code: 'Space' }] }],
  },
]

describe('runtime input controls', () => {
  it('completes what it is given with the built-in contexts, and never overrides one', () => {
    const ids = createInputControls(defaults)
      .maps()
      .map(map => map.id)

    expect(ids).toEqual(['character', 'vehicle', 'flight'])
    // The author's own `jump` kept whole, the actions it predates filled in behind it.
    expect(createInputControls(defaults).maps()[0]?.actions[0]).toEqual(defaults[0]?.actions[0])
  })

  it('rebinds one action without changing the project defaults', () => {
    const controls = createInputControls(defaults)

    expect(controls.rebind('character', 'jump', 0, { device: 'keyboard', code: 'Enter' })).toBe(
      true,
    )

    expect(controls.maps()[0]?.actions[0]?.bindings).toEqual([
      { device: 'keyboard', code: 'Enter' },
    ])
    expect(defaults[0]?.actions[0]?.bindings).toEqual([{ device: 'keyboard', code: 'Space' }])
    expect(controls.bindings().character?.jump).toEqual([{ device: 'keyboard', code: 'Enter' }])
  })

  it('resets bindings and persists both changes', () => {
    const write = vi.fn()
    const controls = createInputControls(defaults, { read: () => null, write })

    const before = createInputControls(defaults).maps()
    controls.rebind('character', 'jump', 0, { device: 'keyboard', code: 'Enter' })
    controls.rebind('vehicle', 'handBrake', 0, { device: 'keyboard', code: 'KeyB' })
    controls.reset()

    // 🛑 Every map, not the one that was looked at: a reset leaving `vehicle` and `flight`
    // rebound was green while this compared a single action of a single context.
    expect(controls.maps()).toEqual(before)
    expect(write).toHaveBeenCalledTimes(3)
  })

  it('refuses an unknown action and a malformed binding', () => {
    const controls = createInputControls(defaults)

    expect(controls.rebind('character', 'missing', 0, { device: 'keyboard', code: 'Enter' })).toBe(
      false,
    )
    expect(controls.rebind('character', 'jump', 0, { device: 'keyboard' })).toBe(false)
  })
})

/**
 * 🛑 One format, TWO readers, and nothing but this holding them together.
 *
 * An exported game ships MIT and takes no VALUE from `@shared/` (see `createWorld`), so
 * `inputControls` re-implements what `inputMap` already reads. They had already drifted: a
 * non-boolean `invert` was DROPPED by the studio and REFUSED by the runtime, so the studio wrote
 * a map the game discarded whole — and the player lost every rebinding, silently.
 */
const KINDS: readonly InputActionKind[] = ['button', 'axis1', 'axis2']

const CANDIDATES: readonly unknown[] = [
  null,
  'leftStick',
  { device: 'pedal', control: 'primary' },
  { device: 'keyboard' },
  { device: 'keyboard', code: '' },
  { device: 'keyboard', code: 'Space' },
  { device: 'keyboard', code: 'KeyA', axis: 'x' },
  { device: 'keyboard', code: 'KeyA', axis: 'z' },
  { device: 'keyboard', code: 'KeyA', scale: -1 },
  { device: 'keyboard', code: 'KeyA', scale: Number.NaN },
  { device: 'mouse', control: 'primary' },
  { device: 'mouse', control: 'secondary' },
  { device: 'gamepad', control: 'leftStick' },
  { device: 'gamepad', control: 'leftStickX' },
  { device: 'gamepad', control: 'leftStickButton' },
  { device: 'gamepad', control: 'south' },
  { device: 'gamepad', control: 'touchpad' },
  { device: 'gamepad', control: 'leftTrigger', deadZone: 0.2 },
  { device: 'gamepad', control: 'leftTrigger', deadZone: 1 },
  { device: 'gamepad', control: 'leftTrigger', deadZone: -0.1 },
  { device: 'gamepad', control: 'leftStick', invert: true },
  { device: 'gamepad', control: 'leftStick', invert: 'yes' },
  { device: 'gamepad', control: 'leftStick', scale: 2 },
  { device: 'gamepad', control: 'leftStick', scale: Number.POSITIVE_INFINITY },
]

function readByStudio(kind: InputActionKind, value: unknown): InputBinding | null {
  try {
    const parsed = inputBindingOf(value)
    return inputBindingFits(kind, parsed) ? parsed : null
  } catch {
    // The studio reader REFUSES by throwing where the runtime one returns null: the two shapes
    // are what this guard exists to compare, so the throw is the refusal.
    return null
  }
}

function readByRuntime(kind: InputActionKind, value: unknown): InputBinding | null {
  const controls = createInputControls([
    {
      version: 1,
      id: 'context',
      priority: 0,
      defaultActive: true,
      actions: [{ id: 'action', kind, bindings: [{ device: 'keyboard', code: 'Space' }] }],
    },
  ])
  if (!controls.rebind('context', 'action', 0, value)) return null
  return controls.bindings().context?.action?.[0] ?? null
}

const shown = (binding: InputBinding | null): string =>
  binding === null ? 'refused' : JSON.stringify(binding, Object.keys(binding).sort())

describe('the studio reader and the runtime reader of one input map', () => {
  it('answers the same on every candidate binding, kind by kind', () => {
    const disagreements = KINDS.flatMap(kind =>
      CANDIDATES.map(value => ({
        kind,
        value,
        studio: shown(readByStudio(kind, value)),
        runtime: shown(readByRuntime(kind, value)),
      })).filter(seen => seen.studio !== seen.runtime),
    )

    expect(disagreements).toEqual([])
  })
})

/**
 * 🛑 `GamepadControl` is stated SIX times over — the two readers above, the two index tables of
 * `inputMaps`, the rebind menu and the editor — and a member added to the union compiles against
 * every one of them. This record is the compiler's hold: a control missing from it does not build.
 */
const EVERY_CONTROL: Record<GamepadControl, InputActionKind> = {
  leftStick: 'axis2',
  rightStick: 'axis2',
  leftStickX: 'axis1',
  leftStickY: 'axis1',
  rightStickX: 'axis1',
  rightStickY: 'axis1',
  leftTrigger: 'axis1',
  rightTrigger: 'axis1',
  south: 'button',
  east: 'button',
  west: 'button',
  north: 'button',
  leftShoulder: 'button',
  rightShoulder: 'button',
  select: 'button',
  start: 'button',
  leftStickButton: 'button',
  rightStickButton: 'button',
  dpadUp: 'button',
  dpadDown: 'button',
  dpadLeft: 'button',
  dpadRight: 'button',
  home: 'button',
}

/** A standard pad with everything pushed: what a control that resolves to no index reads 0 on. */
const PUSHED: RawInput = {
  held: [],
  gamepads: [
    {
      id: 'pad',
      index: 0,
      mapping: 'standard',
      axes: [1, 1, 1, 1],
      buttons: Array.from({ length: 17 }, () => 1),
    },
  ],
}

function reads(binding: InputBinding, kind: InputActionKind): boolean {
  const resolved = resolveInputMaps(
    [
      {
        version: 1,
        id: 'context',
        priority: 0,
        defaultActive: true,
        actions: [{ id: 'action', kind, bindings: [binding] }],
      },
    ],
    ['context'],
    PUSHED,
  )
  const value = resolved.values.action
  if (kind === 'button') return value === true
  if (kind === 'axis1') return typeof value === 'number' && value !== 0
  return typeof value === 'object' && value !== null && (value.x !== 0 || value.y !== 0)
}

describe('every gamepad control the union names', () => {
  it('is read by both readers and answers a pad that is pushed', () => {
    const mute = Object.entries(EVERY_CONTROL)
      .map(([control, kind]) => {
        const value = { device: 'gamepad', control }
        const studio = readByStudio(kind, value)
        return {
          control,
          studio: shown(studio),
          runtime: shown(readByRuntime(kind, value)),
          reads: studio !== null && reads(studio, kind),
        }
      })
      .filter(seen => seen.studio === 'refused' || seen.runtime === 'refused' || !seen.reads)

    expect(mute).toEqual([])
  })
})

describe('a rebinding, against a project that has moved on', () => {
  const stored = () => {
    let kept: unknown = null
    return { read: () => kept, write: (maps: readonly InputMap[]) => void (kept = maps) }
  }

  const bindingOfJump = (controls: ReturnType<typeof createInputControls>) =>
    controls
      .maps()
      .find(map => map.id === 'character')
      ?.actions.find(action => action.id === 'jump')?.bindings[0]

  const jumping: InputMap = {
    version: 1,
    id: 'character',
    priority: 0,
    defaultActive: true,
    actions: [{ id: 'jump', kind: 'button', bindings: [{ device: 'keyboard', code: 'Space' }] }],
  }
  const menu: InputMap = { ...jumping, id: 'menu', actions: [] }

  it('comes back when the project has one more map than the day it was stored', () => {
    const storage = stored()
    createInputControls([jumping], storage).rebind('character', 'jump', 0, {
      device: 'keyboard',
      code: 'KeyJ',
    })

    expect(bindingOfJump(createInputControls([jumping, menu], storage))).toEqual({
      device: 'keyboard',
      code: 'KeyJ',
    })
  })

  it('comes back when the map it belongs to has grown an action', () => {
    const storage = stored()
    createInputControls([jumping], storage).rebind('character', 'jump', 0, {
      device: 'keyboard',
      code: 'KeyJ',
    })
    const grown: InputMap = {
      ...jumping,
      actions: [
        ...jumping.actions,
        { id: 'crouch', kind: 'button', bindings: [{ device: 'keyboard', code: 'KeyC' }] },
      ],
    }

    const controls = createInputControls([grown], storage)
    expect(bindingOfJump(controls)).toEqual({ device: 'keyboard', code: 'KeyJ' })
    // 🛑 And the action nobody stored keeps ITS default rather than coming back empty.
    const crouch = controls
      .maps()
      .find(map => map.id === 'character')
      ?.actions.find(action => action.id === 'crouch')
    expect(crouch?.bindings).toEqual([{ device: 'keyboard', code: 'KeyC' }])
  })

  it('keeps the default when everything stored for that action is rubbish', () => {
    const storage = {
      read: () => [{ id: 'character', actions: [{ id: 'jump', bindings: [{ device: 'ouija' }] }] }],
      write: () => {},
    }

    expect(bindingOfJump(createInputControls([jumping], storage))).toEqual({
      device: 'keyboard',
      code: 'Space',
    })
  })

  it('honours an action somebody unbound on purpose', () => {
    const storage = {
      read: () => [{ id: 'character', actions: [{ id: 'jump', bindings: [] }] }],
      write: () => {},
    }

    expect(bindingOfJump(createInputControls([jumping], storage))).toBeUndefined()
  })
})
