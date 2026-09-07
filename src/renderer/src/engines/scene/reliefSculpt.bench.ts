import { bench } from '@shared/vitestBench'
import { describe } from 'vitest'
import { applyReliefSculpt, changedChunks, type ReliefSculptOperation } from '@shared/domain/relief'
import {
  DEFAULT_RELIEF_ELEVATION,
  DEFAULT_RELIEF_ORIGIN,
  DEFAULT_RELIEF_SIZE,
} from '@shared/domain/scene'

const SIDE = 1024
const samples = { width: SIDE, height: SIDE, values: new Float32Array(SIDE * SIDE) }
const extent = {
  origin: DEFAULT_RELIEF_ORIGIN,
  size: DEFAULT_RELIEF_SIZE,
  elevation: DEFAULT_RELIEF_ELEVATION,
}
function operation(radius: number): ReliefSculptOperation {
  return {
    kind: 'raiseDisk',
    disk: {
      x: extent.origin.x + extent.size.x / 2,
      z: extent.origin.z + extent.size.z / 2,
      radius,
    },
    amount: 0.25,
  }
}

describe('sculpting a full 1024 by 1024 relief disk', () => {
  const cases: [string, number][] = [
    ['32-texel brush', (extent.size.x * 32) / (SIDE - 1)],
    ['whole map', Math.hypot(extent.size.x, extent.size.z) / 2],
  ]
  for (const [name, radius] of cases) {
    bench(
      name,
      () => {
        const after = applyReliefSculpt(samples, extent, undefined, operation(radius))
        changedChunks(undefined, after)
      },
      { time: 300, iterations: 1, warmupIterations: 1 },
    )
  }
})
