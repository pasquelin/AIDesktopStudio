// SPDX-License-Identifier: MIT

import { createInputControls } from '../runtime/inputControls'
import { INPUT_MAP_VERSION, type InputMap } from '@shared/domain/inputMap'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createInputControlsMenu } from './inputControlsMenu'

const MAPS: readonly InputMap[] = [
  {
    version: INPUT_MAP_VERSION,
    id: 'character',
    priority: 0,
    defaultActive: true,
    actions: [{ id: 'jump', kind: 'button', bindings: [{ device: 'keyboard', code: 'Space' }] }],
  },
]

const LABELS = {
  title: 'Controls',
  close: 'Close',
  reset: 'Reset all',
  change: 'Change',
  capture: 'Press a key or controller button',
  add: 'Add binding',
  keyboard: 'Keyboard',
  gamepad: 'Gamepad',
  mouse: 'Mouse',
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('exported controls menu', () => {
  it('opens, rebinds a control, resets it and disposes its page API', () => {
    const before = document.createElement('button')
    document.body.appendChild(before)
    before.focus()
    const controls = createInputControls(MAPS)
    const menu = createInputControlsMenu({ owner: document, controls, labels: LABELS })

    expect(Reflect.get(window, 'aiDesktopStudioControls')).toBe(menu)

    menu.open()
    expect(document.querySelector('[data-input-controls-menu]')?.getAttribute('role')).toBe(
      'dialog',
    )
    expect(document.querySelector('[data-input-controls-menu]')?.getAttribute('aria-modal')).toBe(
      'true',
    )
    expect(document.activeElement).not.toBe(before)
    const binding = document.querySelector<HTMLButtonElement>('[data-input-binding]')
    binding?.click()
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', bubbles: true }))
    expect(controls.bindings().character?.jump).toEqual([{ device: 'keyboard', code: 'Enter' }])
    expect(
      document.querySelector('[data-input-controls-menu]')?.contains(document.activeElement),
    ).toBe(true)

    document.querySelector<HTMLButtonElement>('[data-input-reset]')?.click()
    expect(controls.bindings().character?.jump).toEqual([{ device: 'keyboard', code: 'Space' }])
    expect(
      document.querySelector('[data-input-controls-menu]')?.contains(document.activeElement),
    ).toBe(true)

    menu.dispose()
    expect(document.activeElement).toBe(before)
    expect(Reflect.has(window, 'aiDesktopStudioControls')).toBe(false)
    expect(document.querySelector('[data-input-controls-menu]')).toBeNull()
  })

  it('can add the first binding to an unbound action', () => {
    const controls = createInputControls([
      { ...MAPS[0]!, actions: [{ id: 'jump', kind: 'button', bindings: [] }] },
    ])
    const menu = createInputControlsMenu({ owner: document, controls, labels: LABELS })
    menu.open()

    document.querySelector<HTMLButtonElement>('[data-input-add]')?.click()
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }))

    expect(controls.bindings().character?.jump).toEqual([{ device: 'keyboard', code: 'Space' }])
    menu.dispose()
  })

  it('toggles from Escape when no capture is active', () => {
    const menu = createInputControlsMenu({
      owner: document,
      controls: createInputControls(MAPS),
      labels: LABELS,
    })

    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true }))
    expect(menu.isOpen()).toBe(true)
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true }))
    expect(menu.isOpen()).toBe(false)
    menu.dispose()
  })

  // 🛑 A trigger drives `accelerate` and a shoulder `yaw` in the shipped contexts: refusing a
  // BUTTON on a half-axis left those four slots stuck on « capturing… » for ever, and a capture
  // that dropped the scale made the two halves add up instead of cancelling.
  it('takes a controller button for a half-axis, keeping the way that slot pushes', () => {
    vi.useFakeTimers()
    const held = { mapping: 'standard', buttons: [{ pressed: false }], axes: [0, 0, 0, 0] }
    Object.defineProperty(window.navigator, 'getGamepads', {
      value: () => [held],
      configurable: true,
    })
    const controls = createInputControls([
      {
        ...MAPS[0]!,
        actions: [
          {
            id: 'throttle',
            kind: 'axis1',
            bindings: [{ device: 'gamepad', control: 'leftTrigger', scale: -1 }],
          },
        ],
      },
    ])
    const menu = createInputControlsMenu({ owner: document, controls, labels: LABELS })
    menu.open()

    document.querySelector<HTMLButtonElement>('[data-input-binding]')?.click()
    held.buttons[0]!.pressed = true
    vi.advanceTimersByTime(100)

    expect(controls.bindings().character?.throttle).toEqual([
      { device: 'gamepad', control: 'south', scale: -1 },
    ])
    menu.dispose()
  })
})
