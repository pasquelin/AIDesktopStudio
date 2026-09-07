import { describe, expect, it } from 'vitest'
import { inputMapOf } from './inputMap'
import { completedInputMap, inputMapPreset, INPUT_PRESET_IDS } from './inputPresets'

describe('input presets', () => {
  it('offers a ready-to-play context for every simple workflow', () => {
    expect(INPUT_PRESET_IDS).toEqual(['studio', 'character', 'vehicle', 'flight', 'menu'])
    expect(inputMapPreset('studio').actions.map(action => action.id)).toEqual([
      'navigate',
      'next',
      'previous',
      'confirm',
      'back',
    ])
    expect(inputMapPreset('character').actions.map(action => action.id)).toEqual([
      'move',
      'look',
      'jump',
      'run',
      'interact',
    ])
  })

  it('binds every controller the built-in systems read, keyboard and gamepad both', () => {
    const bindings = (preset: 'character' | 'vehicle' | 'flight', action: string) =>
      inputMapPreset(preset)
        .actions.find(one => one.id === action)
        ?.bindings.map(binding => binding.device)

    expect(bindings('character', 'move')).toContain('gamepad')
    expect(bindings('character', 'move')).toContain('keyboard')
    expect(bindings('vehicle', 'accelerate')).toContain('gamepad')
    expect(bindings('flight', 'yaw')).toContain('gamepad')
  })

  it('writes maps a project can actually SAVE — the rudder is on the shoulders', () => {
    for (const id of INPUT_PRESET_IDS) expect(() => inputMapOf(inputMapPreset(id))).not.toThrow()
  })

  it('leaves the driving and flying contexts ACTIVE, no action name being shared', () => {
    expect(inputMapPreset('vehicle').defaultActive).toBe(true)
    expect(inputMapPreset('flight').defaultActive).toBe(true)
    // A menu PRIMES over the rest, so only a script knows when to push it.
    expect(inputMapPreset('menu').defaultActive).toBe(false)
  })

  it('completes a written map from its preset, and leaves a map of its own alone', () => {
    const preset = inputMapPreset('character')
    const partial = { ...preset, actions: preset.actions.slice(0, 1) }

    expect(completedInputMap(partial).actions.map(one => one.id)).toEqual(
      preset.actions.map(one => one.id),
    )

    const own = { ...preset, id: 'crane', actions: preset.actions.slice(0, 1) }
    expect(completedInputMap(own)).toBe(own)
  })
})
