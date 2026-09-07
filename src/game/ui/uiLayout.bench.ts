// SPDX-License-Identifier: MIT

import { bench } from '@shared/vitestBench'

import { describe } from 'vitest'
import {
  DEFAULT_INTERACTION,
  DEFAULT_PLACEMENT,
  DEFAULT_STACK,
  DEFAULT_STYLE,
  DEFAULT_TEXT,
  SCREEN_PLACEMENT,
  type UiElement,
  type UiScreen,
} from '@shared/domain/ui'
import { layoutOf, type UiMeasure } from './uiLayout'

/**
 * What one solve costs, and why it is measured rather than asserted.
 *
 * The editor solves on every pointermove of a drag, so this sits inside a 16,7 ms frame beside
 * the overlay and React. A threshold in a test would go red on a busy runner and say nothing
 * about the machine anybody edits on — this says the number instead.
 *
 * Measured 2026-08-28 on this Mac: **0,111 ms** for five hundred wrapping siblings and
 * **0,066 ms** for five hundred elements under fifty panels. Two decimal places of the frame.
 */
const VIEWPORT = { width: 1920, height: 1080 }

const measured: UiMeasure = () => ({ width: 40, height: 20 })

const shared = {
  name: '',
  visible: true,
  enabled: true,
  locked: false,
  place: DEFAULT_PLACEMENT,
  style: DEFAULT_STYLE,
  interaction: DEFAULT_INTERACTION,
}

const leaf = (id: string): UiElement => ({ ...shared, id, type: 'text', text: DEFAULT_TEXT })

const rooted = (children: readonly UiElement[]): UiScreen => ({
  ...shared,
  id: 'root',
  type: 'screen',
  place: SCREEN_PLACEMENT,
  children,
})

/** Five hundred siblings under one stack — an inventory, or a list of every level. */
const wide = rooted([
  {
    ...shared,
    id: 'list',
    type: 'stack',
    stack: { ...DEFAULT_STACK, wrap: true },
    children: Array.from({ length: 500 }, (_, index) => leaf(`w${index}`)),
  },
])

/** The same count folded into panels of ten, which is what a real HUD looks like. */
const nested = rooted(
  Array.from({ length: 50 }, (_, group): UiElement => ({
    ...shared,
    id: `g${group}`,
    type: 'panel',
    children: Array.from({ length: 9 }, (_, index) => leaf(`n${group}-${index}`)),
  })),
)

describe('solving an interface', () => {
  bench('five hundred siblings on one wrapping stack', () => {
    layoutOf(wide, VIEWPORT, measured)
  })

  bench('five hundred elements under fifty panels', () => {
    layoutOf(nested, VIEWPORT, measured)
  })
})
