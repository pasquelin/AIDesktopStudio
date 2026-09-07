// SPDX-License-Identifier: MIT

import { bench } from '@shared/vitestBench'

import { describe } from 'vitest'
import { SCALE_SCENES, loadScene } from '../physics/benchScenes'
import { loadJoltPhysics } from './joltPhysics'

/**
 * The series where only the NUMBER of bodies changes — same geometry, same density, same drop, no
 * furniture. What says whether the engine drifts with N rather than with a scene's shape.
 *
 * 🛑 It exists because `physics-500 → 2000 → 5000` is NOT monotone, and that is measured: at 5 000
 * the pile is sixteen layers, nineteen metres, and part of it is still falling when the clock
 * starts. Interactions per active body read LOWER there than at 2 000, so a gap read on that
 * series says the geometry, not the load.
 */
describe('one step of physics, by the number of bodies', async () => {
  for (const scene of SCALE_SCENES) {
    const run = await loadScene(scene, loadJoltPhysics)
    bench(`${scene.name} — ${run.awake()} awake`, () => {
      run.frame()
    })
  }
})
