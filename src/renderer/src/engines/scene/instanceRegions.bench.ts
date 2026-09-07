import { bench } from '@shared/vitestBench'
import { MathUtils } from 'three'
import { describe } from 'vitest'
import { regionsByGrid, type Centres } from './instanceRegions'

/**
 * What splitting costs the frame that has to redo it. The grouping runs on the UI thread on every
 * content change, so a partition slower than the draw calls it saves is a loss.
 */
function scattered(count: number, spread: number, seed: number): Centres {
  const at = new Float64Array(count * 3)
  for (let slot = 0; slot < count; slot += 1) {
    at[slot * 3] = (MathUtils.seededRandom(seed + slot) - 0.5) * spread
    at[slot * 3 + 1] = (MathUtils.seededRandom() - 0.5) * 4
    at[slot * 3 + 2] = (MathUtils.seededRandom() - 0.5) * spread
  }
  return { at, count }
}

/** A real level: clumps of decor with empty ground between them, never an even sprinkle. */
function clumped(count: number, spread: number, clumps: number): Centres {
  const at = new Float64Array(count * 3)
  const hubs = Array.from({ length: clumps }, () => [
    (MathUtils.seededRandom() - 0.5) * spread,
    (MathUtils.seededRandom() - 0.5) * spread,
  ])
  for (let slot = 0; slot < count; slot += 1) {
    const hub = hubs[slot % clumps] ?? [0, 0]
    at[slot * 3] = (hub[0] ?? 0) + (MathUtils.seededRandom() - 0.5) * 12
    at[slot * 3 + 1] = (MathUtils.seededRandom() - 0.5) * 4
    at[slot * 3 + 2] = (hub[1] ?? 0) + (MathUtils.seededRandom() - 0.5) * 12
  }
  return { at, count }
}

for (const count of [1_000, 10_000, 50_000]) {
  const cells = Math.ceil(count / 256)
  const even = scattered(count, 600, 7)
  const clumps = clumped(count, 600, 40)
  describe(`${count} instances into ${cells} regions`, () => {
    bench('evenly spread', () => void regionsByGrid(even, cells))
    bench('in clumps', () => void regionsByGrid(clumps, cells))
  })
}
