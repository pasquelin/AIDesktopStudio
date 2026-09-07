import { describe, expect, it } from 'vitest'
import { reliefLayer } from './scene'
import { scatterGroundOf } from './scatterGround'
import type { ReliefHeightLayer } from './relief'

/** A ramp of exactly one metre of rise per metre east — a true 45°. */
const ramp: ReliefHeightLayer = {
  ...reliefLayer({ assetId: 'h' }, { id: 'ramp', size: { x: 10, z: 10 } }),
  samples: { width: 2, height: 2, values: Float32Array.from([0, 10, 0, 10]) },
}

describe('the slope a scatter reads off the ground', () => {
  it('answers the real angle of a 45° ramp', () => {
    const ground = scatterGroundOf([ramp])

    // Sampled half a metre away and read as a rise over one metre, a 45° ramp came back as 26.57°
    // — every `slopeMin`/`slopeMax` window and every slope alignment was off by ~2× in tangent.
    expect(ground.slopeAt(5, 5).degrees).toBeCloseTo(45, 1)
  })
})
