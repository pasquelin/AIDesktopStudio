// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from './settings'
import { descriptorAt } from './settingsRegistry'

describe('input settings', () => {
  it('keeps gamepad navigation off until the user enables it', () => {
    expect(DEFAULT_SETTINGS.input.gamepadNavigation).toBe(false)
    expect(descriptorAt('input.gamepadNavigation')?.section).toBe('input')
  })
})
