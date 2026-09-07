// SPDX-License-Identifier: MIT

import { INPUT_MAP_VERSION } from '@shared/domain/inputMap'
import { describe, expect, it } from 'vitest'
import type { InputMap } from '@shared/domain/inputMap'
import { inputMapPreset, type InputPresetId } from '@shared/domain/inputPresets'
import { withDefaultInputMaps } from './inputDefaults'

/**
 * The half of the carve-out a suite can hold: the runtime ships without `@shared/`, so it copies
 * these maps — and a test ships nowhere, so it may read both and refuse a drift.
 */
describe('the input contexts a scene falls back on', () => {
  const PLAYED: readonly InputPresetId[] = ['character', 'vehicle', 'flight']

  it('says exactly what the preset says, for the three a game plays with', () => {
    expect(withDefaultInputMaps([])).toEqual(PLAYED.map(inputMapPreset))
  })

  it('completes a declared context ACTION by action, never wholesale', () => {
    const own = {
      version: INPUT_MAP_VERSION,
      id: 'character',
      priority: 0,
      defaultActive: true,
      actions: [{ id: 'jump', kind: 'button', bindings: [] }],
    } satisfies InputMap

    const [completed] = withDefaultInputMaps([own])

    // The author's own answer is kept whole; what predates an action is filled in behind it.
    expect(completed?.actions[0]).toEqual(own.actions[0])
    expect(completed?.actions.map(action => action.id)).toContain('run')
  })

  it('keeps the project map in place and adds only the contexts it left out', () => {
    const own = {
      version: INPUT_MAP_VERSION,
      id: 'character',
      priority: 7,
      defaultActive: false,
      actions: [],
    }

    const completed = withDefaultInputMaps([own])

    // Its own priority and its own switch, untouched — only the actions behind them are filled.
    expect(completed[0]).toMatchObject({ id: 'character', priority: 7, defaultActive: false })
    expect(completed.map(map => map.id)).toEqual(['character', 'vehicle', 'flight'])
  })

  // 🛑 Values are keyed by ID alone: a `move` written as `axis1` made `axis2('move')` answer zero
  // and the character stopped walking, with nothing said.
  it('keeps the built-in KIND when a written map declares another for the same action', () => {
    const written: InputMap = {
      version: INPUT_MAP_VERSION,
      id: 'character',
      priority: 0,
      defaultActive: true,
      actions: [{ id: 'move', kind: 'axis1', bindings: [] }],
    }

    const [completed] = withDefaultInputMaps([written])

    expect(completed?.actions.find(one => one.id === 'move')?.kind).toBe('axis2')
  })

  // 🛑 A file written before version 2 predates the day driving and flying became active by
  // default: a project that had made its own carried `false`, and its plane answered NOTHING.
  it('gives a map written before version 2 the built-in answer on being active', () => {
    const old: InputMap = {
      version: 1,
      id: 'flight',
      priority: 0,
      defaultActive: false,
      actions: [],
    }

    const [upgraded] = withDefaultInputMaps([old])

    expect(upgraded).toMatchObject({ version: INPUT_MAP_VERSION, defaultActive: true })
  })
})
