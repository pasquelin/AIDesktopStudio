import { beforeEach, describe, expect, it } from 'vitest'
import { bindingOf, commandFor, type BindingOverrides } from '@shared/domain/command'
import { DEFAULT_SETTINGS } from '@shared/domain/settings'
import type { CustomNavigation } from '@shared/domain/navigationPreset'
import { currentOverrides, motionFor, resolveBindings } from './bindings'
import { useSettings } from './settings'

const CUSTOM: CustomNavigation = {
  orbit: 'leftAlt',
  pan: 'middle',
  dolly: 'altRight',
  fly: 'anyButton',
}

beforeEach(() => useSettings.setState({ settings: structuredClone(DEFAULT_SETTINGS) }))

describe('resolving navigation bindings', () => {
  it('layers the preset over command defaults and explicit remaps over both', () => {
    const unity = resolveBindings({ 'scene.translate': 'KeyX' }, 'unity', CUSTOM)

    expect(unity['scene.rotate']).toBe('KeyE')
    expect(unity['scene.translate']).toBe('KeyX')
    expect(bindingOf('scene.translate', resolveBindings({}, 'studio', CUSTOM))).toBe('KeyG')
  })

  it('moves commands claimed by a permanent custom flight', () => {
    const bindings = resolveBindings({}, 'custom', { ...CUSTOM, fly: 'always' })

    expect(bindings['scene.scale']).toBe('KeyT')
    expect(bindings['scene.display']).toBe('KeyK')
  })

  it('keeps one cached object until a binding-relevant setting changes', () => {
    const first = currentOverrides()
    expect(currentOverrides()).toBe(first)

    useSettings.setState(state => ({
      settings: {
        ...state.settings,
        three: { ...state.settings.three, navigationPreset: 'unity' },
      },
    }))
    const unity = currentOverrides()
    expect(unity).not.toBe(first)
    expect(unity['scene.translate']).toBe('KeyW')

    useSettings.setState(state => ({
      settings: {
        ...state.settings,
        three: {
          ...state.settings.three,
          navigationPreset: 'custom',
          navigationCustomFly: 'always',
        },
      },
    }))
    const permanent = currentOverrides()
    expect(permanent).not.toBe(unity)
    expect(permanent['scene.scale']).toBe('KeyT')
  })

  // A settings file outlives the commands of the build that wrote it: `character.navigate` left
  // on 2026-09-06, and a key someone had put on it must not take the whole table down.
  it('carries a remap persisted on a command this build no longer declares', () => {
    // What a persisted file holds, which the type of this build cannot name any more.
    const stale = { 'character.navigate': 'KeyN' } as BindingOverrides
    useSettings.setState(state => ({
      settings: { ...state.settings, shortcuts: { ...state.settings.shortcuts, overrides: stale } },
    }))

    expect(bindingOf('scene.navigate', currentOverrides())).toBe('Backquote')
    expect(commandFor('Backquote', 'scene', currentOverrides())).toBe('scene.navigate')
    expect(commandFor('KeyN', 'character', currentOverrides())).toBeNull()
  })
})

/**
 * A flight reads the raw code and cancels the event in the CAPTURE phase, so whatever it claims
 * never reaches a command at all. Under a permanent flight that is forever — ⌘Z would be eaten
 * as `forward` on AZERTY, where the key printing `z` sits at the code `KeyW`.
 */
describe('what a flight may claim of a key', () => {
  it('takes a bare direction, and one under shift, which IS boost', () => {
    expect(motionFor('KeyW')).toBe('forward')
    expect(motionFor('KeyW', { shiftKey: true })).toBe('forward')
  })

  it('leaves a key ⌘ or Ctrl holds to the command that wants it', () => {
    expect(motionFor('KeyW', { metaKey: true })).toBeNull()
    expect(motionFor('KeyW', { ctrlKey: true })).toBeNull()
  })

  /**
   * Alt is NOT one of them, however tempting: the studio ORBITS on ⌥ + left and arms the flight
   * on that same press, so refusing it stopped the camera in the middle of the gesture.
   */
  it('takes a direction under alt, which is what the studio orbits with', () => {
    expect(motionFor('KeyW', { altKey: true })).toBe('forward')
  })

  it('answers nothing for a key no direction sits on', () => {
    expect(motionFor('KeyB')).toBeNull()
  })
})
