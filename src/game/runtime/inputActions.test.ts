// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest'
import type { InputMap } from './inputMap'
import { createInputActions } from './inputActions'

const MAPS: readonly InputMap[] = [
  {
    version: 1,
    id: 'character',
    priority: 0,
    defaultActive: true,
    actions: [{ id: 'jump', kind: 'button', bindings: [{ device: 'keyboard', code: 'Space' }] }],
  },
]

const holding = (...held: string[]) => ({ held, gamepads: [] })

/** What the port saw between two steps: down AND up, so `held` names it at neither of them. */
const tapping = (...pressed: string[]) => ({ held: [], gamepads: [], pressed })

describe('the actions of a step', () => {
  it('says a button is PRESSED on the step it went down, and never again while it is held', () => {
    const actions = createInputActions()

    actions.sample(MAPS, ['character'], holding())
    actions.sample(MAPS, ['character'], holding('Space'))
    expect(actions.pressed('jump')).toBe(true)
    expect(actions.button('jump')).toBe(true)

    actions.sample(MAPS, ['character'], holding('Space'))
    expect(actions.pressed('jump')).toBe(false)
    expect(actions.button('jump')).toBe(true)
  })

  it('says RELEASED on the step it came up, and nothing before the first sample', () => {
    const actions = createInputActions()
    expect(actions.button('jump')).toBe(false)

    actions.sample(MAPS, ['character'], holding('Space'))
    actions.sample(MAPS, ['character'], holding())

    expect(actions.released('jump')).toBe(true)
    expect(actions.button('jump')).toBe(false)
  })

  /** 🛑 A 20 ms tap on a 33 ms frame is gone from `held` at both samples — the port clears it. */
  it('still fires for a key tapped BETWEEN two steps, and says it came up too', () => {
    const actions = createInputActions()

    actions.sample(MAPS, ['character'], holding())
    actions.sample(MAPS, ['character'], tapping('Space'))

    expect(actions.pressed('jump')).toBe(true)
    expect(actions.released('jump')).toBe(true)
    expect(actions.button('jump')).toBe(false)
  })

  it('does not fire a second time on the step after a tap', () => {
    const actions = createInputActions()

    actions.sample(MAPS, ['character'], tapping('Space'))
    actions.sample(MAPS, ['character'], holding())

    expect(actions.pressed('jump')).toBe(false)
  })

  it('answers nothing for an action of a context that is not active', () => {
    const actions = createInputActions()

    actions.sample(MAPS, [], holding('Space'))

    expect(actions.button('jump')).toBe(false)
    expect(actions.pressed('jump')).toBe(false)
  })
})

describe('an action two active contexts declare', () => {
  const declaring = (id: string, priority: number, action: string): InputMap => ({
    version: 1,
    id,
    priority,
    defaultActive: true,
    actions: [{ id: action, kind: 'button', bindings: [{ device: 'keyboard', code: 'KeyJ' }] }],
  })

  it('is named once, however many steps run', () => {
    const said: string[] = []
    const actions = createInputActions(message => said.push(message))
    const maps = [declaring('character', 0, 'jump'), declaring('vehicle', 10, 'jump')]

    for (let step = 0; step < 5; step += 1)
      actions.sample(maps, ['character', 'vehicle'], { held: [] })

    expect(said).toHaveLength(1)
    expect(said[0]).toContain('jump')
    expect(said[0]).toContain('vehicle')
  })

  it('says nothing when the active contexts share no action name', () => {
    const said: string[] = []
    const actions = createInputActions(message => said.push(message))

    actions.sample(
      [declaring('character', 0, 'jump'), declaring('vehicle', 10, 'handBrake')],
      ['character', 'vehicle'],
      { held: [] },
    )

    expect(said).toEqual([])
  })
})

/** 🛑 The selection is HELD between steps — these two say it cannot go stale. */
describe('the held selection', () => {
  const jumping = (id: string, code: string): InputMap => ({
    version: 1,
    id,
    priority: 0,
    defaultActive: true,
    actions: [{ id: 'jump', kind: 'button', bindings: [{ device: 'keyboard', code }] }],
  })

  it('follows a context pushed between two steps', () => {
    const actions = createInputActions()
    const maps = [jumping('character', 'Space'), jumping('menu', 'Enter')]

    actions.sample(maps, ['character'], { held: ['Enter'] })
    expect(actions.button('jump')).toBe(false)

    actions.sample(maps, ['character', 'menu'], { held: ['Enter'] })
    expect(actions.button('jump')).toBe(true)
  })

  it('follows a rebinding, which hands over a new array of maps', () => {
    const actions = createInputActions()

    actions.sample([jumping('character', 'Space')], ['character'], { held: ['KeyJ'] })
    expect(actions.button('jump')).toBe(false)

    actions.sample([jumping('character', 'KeyJ')], ['character'], { held: ['KeyJ'] })
    expect(actions.button('jump')).toBe(true)
  })
})
