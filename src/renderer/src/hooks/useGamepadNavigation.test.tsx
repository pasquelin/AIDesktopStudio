// SPDX-License-Identifier: MIT
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { InputMap } from '@shared/domain/inputMap'
import { inputMapPreset } from '@shared/domain/inputPresets'
import { createInputActions } from '@game/runtime/inputActions'
import { installFakeBridge } from '@/services/fakeBridge'
import { standardGamepad } from '@game/runtime/input-fixtures'
import {
  applyGamepadNavigation,
  navigationState,
  studioInputMaps,
  type GamepadNavigationState,
} from './useGamepadNavigation'

const RESTING: GamepadNavigationState = {
  next: false,
  previous: false,
  confirm: false,
  back: false,
}

describe('gamepad navigation', () => {
  it('moves through focusable controls and confirms on a fresh press', () => {
    const activate = vi.fn()
    render(
      <div>
        <button type="button">First</button>
        <button type="button" onClick={activate}>
          Second
        </button>
      </div>,
    )

    applyGamepadNavigation({ ...RESTING, next: true }, RESTING)
    expect(document.activeElement?.textContent).toBe('First')
    applyGamepadNavigation({ ...RESTING, next: true }, RESTING)
    expect(document.activeElement?.textContent).toBe('Second')
    applyGamepadNavigation({ ...RESTING, confirm: true }, RESTING)
    expect(activate).toHaveBeenCalledOnce()
  })

  it('does not repeat a held direction', () => {
    render(<button type="button">Only</button>)
    const held = { ...RESTING, next: true }

    applyGamepadNavigation(held, held)

    expect(document.activeElement).toBe(document.body)
  })

  it('skips controls hidden by CSS or accessibility state', () => {
    render(
      <div>
        <button type="button" style={{ display: 'none' }}>
          CSS hidden
        </button>
        <div aria-hidden="true">
          <button type="button">ARIA hidden</button>
        </div>
        <button type="button">Visible</button>
      </div>,
    )

    applyGamepadNavigation({ ...RESTING, next: true }, RESTING)

    expect(document.activeElement?.textContent).toBe('Visible')
  })
})

describe('what the studio reads a pushed control as', () => {
  const read = (
    map: InputMap,
    axes: Parameters<typeof standardGamepad>[0] = {},
    pushed: Parameters<typeof standardGamepad>[1] = [],
  ): GamepadNavigationState => {
    const actions = createInputActions()
    actions.sample([map], ['studio'], { held: [], gamepads: [standardGamepad(axes, pushed)] })
    return navigationState(actions)
  }
  const studio = inputMapPreset('studio')

  it('takes the d-pad and the left stick, as it always did', () => {
    expect(read(studio, {}, ['dpadDown']).next).toBe(true)
    expect(read(studio, {}, ['dpadRight']).next).toBe(true)
    expect(read(studio, {}, ['dpadUp']).previous).toBe(true)
    expect(read(studio, {}, ['dpadLeft']).previous).toBe(true)
    expect(read(studio, { leftX: 0.9 }).next).toBe(true)
    expect(read(studio, { leftY: -0.9 }).previous).toBe(true)
    expect(read(studio, {}, ['south']).confirm).toBe(true)
    expect(read(studio, {}, ['east']).back).toBe(true)
  })

  it('leaves a resting controller alone', () => {
    expect(read(studio)).toEqual({
      next: false,
      previous: false,
      confirm: false,
      back: false,
    })
  })

  /**
   * 🛑 What §1.6 of the audit said was impossible: the preset was offered beside the four others
   * and nothing read it, so rebinding `confirm` and saving changed strictly nothing.
   */
  it('follows a project that rebound confirm, and stops answering the old button', () => {
    const rebound: InputMap = {
      ...studio,
      actions: studio.actions.map(action =>
        action.id === 'confirm'
          ? { ...action, bindings: [{ device: 'gamepad', control: 'north' }] }
          : action,
      ),
    }

    expect(read(rebound, {}, ['north']).confirm).toBe(true)
    expect(read(rebound, {}, ['south']).confirm).toBe(false)
  })
})

describe('which studio map the navigation walks by', () => {
  it('takes the project’s own context when a file carries it', async () => {
    const mine: InputMap = { ...inputMapPreset('studio'), priority: 7 }
    installFakeBridge({
      inputMaps: {
        list: () => Promise.resolve(['Controls/mine.input.json']),
        read: () => Promise.resolve(mine),
      },
    })

    expect(await studioInputMaps()).toEqual([mine])
  })

  it('falls back to the starting point when the project declares none', async () => {
    installFakeBridge({
      inputMaps: { list: () => Promise.resolve([]), read: () => Promise.resolve(null) },
    })

    expect(await studioInputMaps()).toEqual([inputMapPreset('studio')])
  })
})
