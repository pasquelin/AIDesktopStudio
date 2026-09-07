// SPDX-License-Identifier: MIT

import { bench } from '@shared/vitestBench'

import { describe } from 'vitest'
import type { InputState } from '../ports/inputPort'
import type { ScriptEntity, ScriptFrame } from '../script/frame'
import type { ScriptPort } from '../ports/scriptPort'
import { loadQuickjsScripts } from './quickjsScripts'

/**
 * What a frame of scripts costs. Measured 2026-08-27 on this Mac, mean of a run at rme < 1 %:
 *
 * | 200 entities, hook present and empty            | **1,63 ms** |
 * | 200 bare entities moving                        | 1,74 ms |
 * | 200 entities carrying two components, moving    | **2,16 ms** (p99 2,49) |
 * | 200 entities reading a component                | 2,15 ms |
 * | 1 000 entities carrying two components          | 6,85 ms |
 * | 200 entities whose script has no such hook      | **0,00005 ms** |
 *
 * 🛑 Three things this settles. The cost is the CROSSING, not the work: a hook that does nothing
 * is already 75 % of one that moves every entity. What an entity CARRIES is the rest — two
 * components add 0,42 ms over 200 entities, because the whole component list is serialized
 * whether or not `self.get` is called. And the hook mask is worth 40 000×, which is the whole
 * reason `declares` exists.
 *
 * 🛑 The 0,571 ms this lot was written against does NOT reproduce — the real figure is 2,16 ms
 * for 200 scripted entities carrying components, near four times it. `SCRIPT_BUDGET_MS` is
 * therefore spent by some 370 of them, not by the 1 400 the spike suggested.
 */
const IDLE: InputState = {
  held: [],
  pressed: [],
  released: [],
  pointer: { x: 0, y: 0, down: false },
}

const WALK =
  'exports.default = defineScript({ onUpdate(self, ctx, dt) { self.moveBy(0, 0, -dt) } })'
const READ =
  'exports.default = defineScript({ onUpdate(self) { const h = self.get("Health"); if (h) self.moveBy(0, h.current * 0, 0) } })'
const EMPTY_HOOK = 'exports.default = defineScript({ onUpdate() {} })'
const IDLE_SCRIPT = 'exports.default = defineScript({ onCreate() {} })'

const entity = (index: number, carrying: boolean): ScriptEntity => ({
  entity: `e${index}`,
  name: `Walker ${index}`,
  position: { x: index, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  components: carrying
    ? [
        { type: 'Health', max: 100, current: 40 },
        { type: 'Movement', speed: 4, turnSpeed: 6 },
      ]
    : [],
})

async function scripted(
  count: number,
  code: string,
  carrying = true,
): Promise<[ScriptPort, ScriptFrame]> {
  const port = await loadQuickjsScripts()
  port.load([{ script: 'script:Walk.ts', code }])
  port.attach(
    Array.from({ length: count }, (_, index) => ({
      entity: `e${index}`,
      script: 'script:Walk.ts',
      props: {},
    })),
  )
  const entities = Array.from({ length: count }, (_, index) => entity(index, carrying))
  return [port, { tick: 1, dt: 1 / 60, input: IDLE, actions: {}, bindings: {}, entities, kept: {} }]
}

/** One rendered frame's worth, as the SYSTEM drives it: the mask first, then the hook. */
const frameOf = (port: ScriptPort, frame: ScriptFrame) => () => {
  port.refill()
  if (port.declares('onUpdate')) port.run('onUpdate', frame)
}

describe('one frame of scripts, through the bridge', async () => {
  const [bare200, bareFrame200] = await scripted(200, WALK, false)
  const [moving200, movingFrame200] = await scripted(200, WALK)
  const [moving1000, movingFrame1000] = await scripted(1000, WALK)
  const [reading200, readingFrame200] = await scripted(200, READ)
  const [empty200, emptyFrame200] = await scripted(200, EMPTY_HOOK)
  const [silent200, silentFrame200] = await scripted(200, IDLE_SCRIPT)

  // The crossing ALONE: the hook is there and does nothing, so nothing comes back.
  bench('200 entities whose hook does nothing', frameOf(empty200, emptyFrame200))
  bench('200 bare entities moving', frameOf(bare200, bareFrame200))
  bench('200 entities carrying two components, moving', frameOf(moving200, movingFrame200))
  bench('1 000 entities carrying two components, moving', frameOf(moving1000, movingFrame1000))
  bench('200 entities reading a component', frameOf(reading200, readingFrame200))
  // 🛑 The one that must be near zero: nobody wrote `onUpdate`, so nothing crosses at all.
  bench('200 entities whose script has no such hook', frameOf(silent200, silentFrame200))
})
