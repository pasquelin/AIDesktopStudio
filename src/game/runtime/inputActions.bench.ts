// SPDX-License-Identifier: MIT

import { bench } from '@shared/vitestBench'
import { describe } from 'vitest'
import { createInputActions } from './inputActions'
import { createInputContexts } from './inputContexts'
import { createInputControls } from './inputControls'
import { resolveInputMaps } from './inputMaps'
import { reading, standardGamepad } from './input-fixtures'

/**
 * What ONE step of input costs, on the built-in contexts a project gets with no file at all —
 * three contexts, fourteen actions, fifty bindings.
 *
 * 🛑 The décor is built HERE, at module level, outside every timed section. Each `bench` below
 * holds one gesture and its name says exactly what the figure contains: `sample` is the whole
 * step a world pays, `resolveInputMaps` is the resolution ALONE with its selection redone, and
 * the two differ by the selection `inputActions` holds between steps.
 */
const controls = createInputControls([])
const maps = controls.maps()
const active = createInputContexts(maps).active()

const atRest = reading()
const walking = reading({ held: ['KeyW', 'ShiftLeft'] })
const withPad = reading({ held: ['KeyW'], gamepads: [standardGamepad({ leftX: 0.6 })] })
const tapping = reading({ held: ['KeyW'], pressed: ['Space'] })

const actions = createInputActions()

describe('one step of input', () => {
  bench('samples a resting keyboard', () => {
    actions.sample(maps, active, atRest)
  })

  bench('samples two keys held', () => {
    actions.sample(maps, active, walking)
  })

  bench('samples a key and a stick', () => {
    actions.sample(maps, active, withPad)
  })

  // 🛑 A tap resolves TWICE — that is what makes a 20 ms press register — so this is the peak,
  // not the ordinary step. Measured at +71 % of a plain step before the selection was held.
  bench('samples a key tapped between two steps', () => {
    actions.sample(maps, active, tapping)
  })
})

describe('resolution alone, its selection redone each time', () => {
  bench('resolves a key and a stick', () => {
    resolveInputMaps(maps, active, withPad)
  })
})
