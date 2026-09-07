// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import { INPUT_MAP_VERSION, type InputMap } from './inputMap'
import { PLAYED_INPUT_PRESETS, withDefaultInputMaps } from './inputDefaults'

describe('the input contexts a scene falls back on', () => {
  // 🛑 Handed out as they ARE, not copied: `createInputControls` clones what it keeps, and cloning
  // twice hid which of the two owned the copy.
  it('hands out the three a game plays with, untouched, when it is given nothing', () => {
    expect(withDefaultInputMaps([])).toEqual([
      PLAYED_INPUT_PRESETS.character,
      PLAYED_INPUT_PRESETS.vehicle,
      PLAYED_INPUT_PRESETS.flight,
    ])
    expect(withDefaultInputMaps([])[0]).toBe(PLAYED_INPUT_PRESETS.character)
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

  // 🛑 The id comes out of a project file, so it names anything: `'constructor'` walked the
  // prototype chain, read truthy, and took the play session down on `built.actions`.
  it('leaves a context named after something on the prototype chain alone', () => {
    const named = (id: string): InputMap => ({
      version: INPUT_MAP_VERSION,
      id,
      priority: 0,
      defaultActive: true,
      actions: [],
    })

    for (const id of ['constructor', 'toString', 'valueOf', '__proto__']) {
      expect(() => withDefaultInputMaps([named(id)])).not.toThrow()
      expect(withDefaultInputMaps([named(id)])[0]).toEqual(named(id))
    }
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
