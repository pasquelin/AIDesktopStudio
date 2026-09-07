// SPDX-License-Identifier: MIT

import { bench } from '@shared/vitestBench'

import { describe } from 'vitest'
import { DEPTH_SCENES, loadScene } from '../physics/benchScenes'
import { loadJoltPhysics } from './joltPhysics'

/**
 * Two thousand bodies throughout, and only the DEPTH of the stack changes. The one series that
 * answers whether a contact costs more when the chains it belongs to get longer.
 *
 * 🛑 Measured 2026-09-01, one layer against sixteen: Rapier holds a flat 0,85–1,45 µs a contact
 * point whatever the shape, Jolt walks from 0,79 to 1,69. Jolt is 2,3 times faster on a wide
 * shallow sheet — which is what a level is — and 1,9 times slower on a deep pile. **The crossing
 * is near five stacked layers**, and that is the production risk this file keeps honest.
 */
describe('one step of physics, by the depth of the stack', async () => {
  for (const scene of DEPTH_SCENES) {
    const run = await loadScene(scene, loadJoltPhysics)
    bench(`${scene.name} — ${run.awake()} awake`, () => {
      run.frame()
    })
  }
})
