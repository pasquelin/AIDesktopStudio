import { describe, expect, it } from 'vitest'
import {
  RELIEF_CHUNK_TEXELS,
  applyReliefSculpt,
  combinedAt,
  flattenReliefDisk,
  paintReliefMask,
  raiseReliefDisk,
  smoothReliefDisk,
  withChunkDelta,
  type ReliefOverlay,
  type ReliefSculpt,
} from './relief'
import { DEFAULT_RELIEF_ELEVATION, DEFAULT_RELIEF_ORIGIN, DEFAULT_RELIEF_SIZE } from './scene'
import type { ReliefMask } from './relief'

function heightAt(
  samples: { width: number; height: number; values: Float32Array },
  sculpt: ReliefSculpt | undefined,
  sx: number,
  sz: number,
): number {
  return combinedAt(
    samples,
    RELIEF_CHUNK_TEXELS,
    sculpt ? [{ enabled: true, alpha: 1, sculpt }] : [],
    sx,
    sz,
  )
}

describe('raiseReliefDisk', () => {
  const samples = {
    width: 66,
    height: 8,
    values: new Float32Array(66 * 8),
  }
  const extent = {
    origin: DEFAULT_RELIEF_ORIGIN,
    size: DEFAULT_RELIEF_SIZE,
    elevation: DEFAULT_RELIEF_ELEVATION,
  }
  const stepX = extent.size.x / (samples.width - 1)
  const seamX = extent.origin.x + 64 * stepX

  it('raises a sample inside the disk and leaves one outside', () => {
    const sculpt = raiseReliefDisk(
      samples,
      extent,
      undefined,
      { x: seamX, z: extent.origin.z, radius: stepX * 2 },
      3,
    )
    expect(heightAt(samples, sculpt, 64, 0)).toBe(3)
    expect(heightAt(samples, sculpt, 0, 0)).toBe(0)
  })

  it('writes the same delta on both chunks that share the seam sample', () => {
    const sculpt = raiseReliefDisk(
      samples,
      extent,
      undefined,
      { x: seamX, z: extent.origin.z, radius: stepX * 2 },
      3,
    )
    expect(sculpt.chunks).toHaveLength(2)
  })

  it('keeps an existing chunk outside the disk unchanged', () => {
    const prior = withChunkDelta(samples, undefined, {
      column: 0,
      row: 0,
      localX: 0,
      localZ: 0,
      delta: 2,
    })
    const sculpt = raiseReliefDisk(
      samples,
      extent,
      prior,
      { x: seamX, z: extent.origin.z, radius: stepX * 2 },
      3,
    )
    expect(heightAt(samples, sculpt, 0, 0)).toBe(2)
  })

  it('is the same arithmetic a worker calls, with no scene or renderer to mount', () => {
    const disk = { x: seamX, z: extent.origin.z, radius: stepX * 2 }
    expect(
      applyReliefSculpt(samples, extent, undefined, { kind: 'raiseDisk', disk, amount: 3 }),
    ).toEqual(raiseReliefDisk(samples, extent, undefined, disk, 3))
  })

  it('keeps a hard edge when falloff is 0, matching the disk without a falloff', () => {
    const disk = { x: seamX, z: extent.origin.z, radius: stepX * 2 }
    expect(raiseReliefDisk(samples, extent, undefined, disk, 3, 0)).toEqual(
      raiseReliefDisk(samples, extent, undefined, disk, 3),
    )
  })

  it('tapers the delta toward the rim when falloff is greater than 0', () => {
    const disk = { x: seamX, z: extent.origin.z, radius: stepX * 4 }
    const hard = heightAt(samples, raiseReliefDisk(samples, extent, undefined, disk, 3, 0), 62, 0)
    const soft = heightAt(samples, raiseReliefDisk(samples, extent, undefined, disk, 3, 1), 62, 0)
    expect(soft).toBeGreaterThan(0)
    expect(soft).toBeLessThan(hard)
  })

  it('scales the written delta with the amount, so 0.2 raises twice 0.1', () => {
    const disk = { x: seamX, z: extent.origin.z, radius: stepX * 2 }
    const a = heightAt(samples, raiseReliefDisk(samples, extent, undefined, disk, 0.1), 64, 0)
    const b = heightAt(samples, raiseReliefDisk(samples, extent, undefined, disk, 0.2), 64, 0)
    expect(b).toBeCloseTo(a * 2)
  })

  /**
   * 🛑 A map of 2ⁿ+1 samples, which is what every classic heightmap is. Its last sample sits on a
   * border whose two chunks are the SAME one, the index being clamped to the last — so the amount
   * was added twice down the far edge and four times in the corner.
   */
  describe('at the far edge of a 129-sample map', () => {
    const wide = { width: 129, height: 129, values: new Float32Array(129 * 129) }
    const step = extent.size.x / (wide.width - 1)
    const corner = { x: extent.origin.x + 128 * step, z: extent.origin.z + 128 * step }

    it('raises the far corner by the amount asked for, not four times it', () => {
      const sculpt = raiseReliefDisk(wide, extent, undefined, { ...corner, radius: step }, 3)

      expect(heightAt(wide, sculpt, 128, 128)).toBe(3)
      expect(heightAt(wide, sculpt, 128, 127)).toBe(3)
    })
  })
})

describe('smoothReliefDisk', () => {
  const width = 8
  const values = new Float32Array(width * width)
  values[3 * width + 3] = 1
  const samples = { width, height: width, values }
  const extent = {
    origin: DEFAULT_RELIEF_ORIGIN,
    size: DEFAULT_RELIEF_SIZE,
    elevation: DEFAULT_RELIEF_ELEVATION,
  }
  const stepX = extent.size.x / (width - 1)
  const disk = {
    x: extent.origin.x + 3 * stepX,
    z: extent.origin.z + 3 * (extent.size.z / (width - 1)),
    radius: stepX * 3,
  }

  it('reduces an isolated peak toward its neighbours without erasing it in one stroke', () => {
    const sculpt = smoothReliefDisk(samples, extent, undefined, disk, 0.1)
    const peak = heightAt(samples, sculpt, 3, 3)
    const neighbour = heightAt(samples, sculpt, 3, 2)

    expect(peak).toBeGreaterThan(0.8)
    expect(peak).toBeLessThan(1)
    expect(neighbour).toBeGreaterThan(0)
    expect(peak).toBeGreaterThan(neighbour)
  })

  it('is the same arithmetic applyReliefSculpt runs for kind smooth', () => {
    expect(
      applyReliefSculpt(samples, extent, undefined, { kind: 'smooth', disk, amount: 1 }),
    ).toEqual(smoothReliefDisk(samples, extent, undefined, disk, 1))
  })

  it('writes the correction into the armed overlay, so disabling it restores the others', () => {
    const flat = { width, height: width, values: new Float32Array(width * width) }
    const hills = withChunkDelta(flat, undefined, {
      column: 0,
      row: 0,
      localX: 3,
      localZ: 3,
      delta: 1,
    })
    const overlays = [{ enabled: true, alpha: 1, sculpt: hills }]
    const sculpt = smoothReliefDisk(
      flat,
      extent,
      undefined,
      disk,
      1,
      0,
      RELIEF_CHUNK_TEXELS,
      undefined,
      overlays,
    )

    expect(
      combinedAt(
        flat,
        RELIEF_CHUNK_TEXELS,
        [...overlays, { enabled: true, alpha: 1, sculpt }],
        3,
        3,
      ),
    ).toBeLessThan(1)
    expect(
      combinedAt(
        flat,
        RELIEF_CHUNK_TEXELS,
        [...overlays, { enabled: false, alpha: 1, sculpt }],
        3,
        3,
      ),
    ).toBeCloseTo(1)
  })
})

describe('flattenReliefDisk', () => {
  const width = 8
  const values = Float32Array.from({ length: width * width }, (_, at) => (at % width) * 0.1)
  const samples = { width, height: width, values }
  const extent = {
    origin: DEFAULT_RELIEF_ORIGIN,
    size: DEFAULT_RELIEF_SIZE,
    elevation: DEFAULT_RELIEF_ELEVATION,
  }
  const stepX = extent.size.x / (width - 1)
  const disk = {
    x: extent.origin.x + 3 * stepX,
    z: extent.origin.z + 3 * (extent.size.z / (width - 1)),
    radius: stepX * 2,
  }
  const target = heightAt(samples, undefined, 3, 3)

  it('pulls every texel in the disk toward the reference height', () => {
    const sculpt = flattenReliefDisk(samples, extent, undefined, disk, target, 1)

    expect(heightAt(samples, sculpt, 3, 3)).toBeCloseTo(target)
    expect(heightAt(samples, sculpt, 2, 3)).toBeCloseTo(target)
    expect(heightAt(samples, sculpt, 4, 3)).toBeCloseTo(target)
    expect(heightAt(samples, sculpt, 0, 0)).toBeCloseTo(0)
  })

  it('restores the surface when the overlay that holds the correction is disabled', () => {
    const sculpt = flattenReliefDisk(samples, extent, undefined, disk, target, 1)
    const before = heightAt(samples, undefined, 2, 3)

    expect(
      combinedAt(samples, RELIEF_CHUNK_TEXELS, [{ enabled: false, alpha: 1, sculpt }], 2, 3),
    ).toBeCloseTo(before)
  })

  it('is the same arithmetic applyReliefSculpt runs for kind flatten', () => {
    expect(
      applyReliefSculpt(samples, extent, undefined, { kind: 'flatten', disk, amount: 1, target }),
    ).toEqual(flattenReliefDisk(samples, extent, undefined, disk, target, 1))
  })
})

describe('overlay masks', () => {
  const samples = {
    width: 8,
    height: 8,
    values: new Float32Array(64),
  }
  const extent = {
    origin: { x: 0, z: 0 },
    size: { x: 7, z: 7 },
    elevation: { min: 0, max: 1000 },
  }
  const hills = withChunkDelta(samples, undefined, {
    column: 0,
    row: 0,
    localX: 2,
    localZ: 2,
    delta: 1,
  })
  const valley = withChunkDelta(samples, undefined, {
    column: 0,
    row: 0,
    localX: 4,
    localZ: 2,
    delta: 1,
  })

  it('leaves an overlay without a mask as alpha times delta', () => {
    expect(
      combinedAt(
        samples,
        RELIEF_CHUNK_TEXELS,
        [{ enabled: true, alpha: 0.5, sculpt: hills }],
        2,
        2,
      ),
    ).toBeCloseTo(0.5)
  })

  it('zeroes a height-masked overlay outside the range and keeps it inside', () => {
    const overlay: ReliefOverlay = {
      enabled: true,
      alpha: 1,
      sculpt: hills,
      mask: { kind: 'height', min: 100, max: 800 },
    }
    const low = { ...samples, values: Float32Array.from({ length: 64 }, () => 0.05) }
    const mid = { ...samples, values: Float32Array.from({ length: 64 }, () => 0.4) }

    expect(combinedAt(low, RELIEF_CHUNK_TEXELS, [overlay], 2, 2, extent)).toBeCloseTo(0.05)
    expect(combinedAt(mid, RELIEF_CHUNK_TEXELS, [overlay], 2, 2, extent)).toBeCloseTo(1.4)
  })

  it('zeroes a slope-masked overlay on the flat and keeps it on a ramp', () => {
    const ramp = {
      width: 8,
      height: 8,
      values: Float32Array.from({ length: 64 }, (_, at) => (at % 8) * 0.2),
    }
    const overlay: ReliefOverlay = {
      enabled: true,
      alpha: 1,
      sculpt: withChunkDelta(ramp, undefined, {
        column: 0,
        row: 0,
        localX: 3,
        localZ: 3,
        delta: 1,
      }),
      mask: { kind: 'slope', min: 20, max: 90 },
    }

    expect(combinedAt(samples, RELIEF_CHUNK_TEXELS, [overlay], 3, 3, extent)).toBeCloseTo(0)
    expect(combinedAt(ramp, RELIEF_CHUNK_TEXELS, [overlay], 3, 3, extent)).toBeGreaterThan(
      ramp.values[3 * 8 + 3] ?? 0,
    )
  })

  it('modulates only the painted overlay, not its neighbour', () => {
    const paint = withChunkDelta(samples, undefined, {
      column: 0,
      row: 0,
      localX: 2,
      localZ: 2,
      delta: 1,
    })
    const overlays: ReliefOverlay[] = [
      { enabled: true, alpha: 1, sculpt: hills, mask: { kind: 'painted', weights: paint } },
      { enabled: true, alpha: 1, sculpt: valley },
    ]

    expect(combinedAt(samples, RELIEF_CHUNK_TEXELS, overlays, 2, 2)).toBeCloseTo(1)
    expect(combinedAt(samples, RELIEF_CHUNK_TEXELS, overlays, 4, 2)).toBeCloseTo(1)
    expect(combinedAt(samples, RELIEF_CHUNK_TEXELS, overlays, 3, 2)).toBeCloseTo(0)
  })

  it('paints an absolute weight under the disk', () => {
    const placed = {
      origin: DEFAULT_RELIEF_ORIGIN,
      size: DEFAULT_RELIEF_SIZE,
      elevation: DEFAULT_RELIEF_ELEVATION,
    }
    const stepX = placed.size.x / (samples.width - 1)
    const stepZ = placed.size.z / (samples.height - 1)
    const empty: ReliefOverlay = {
      enabled: true,
      alpha: 1,
      sculpt: hills,
      mask: { kind: 'painted', weights: { chunks: [] } },
    }
    const weights = paintReliefMask(
      samples,
      placed,
      undefined,
      { x: placed.origin.x + 2 * stepX, z: placed.origin.z + 2 * stepZ, radius: stepX },
      1,
    )
    const painted: ReliefOverlay = { ...empty, mask: { kind: 'painted', weights } }

    expect(combinedAt(samples, RELIEF_CHUNK_TEXELS, [empty], 2, 2)).toBeCloseTo(0)
    expect(combinedAt(samples, RELIEF_CHUNK_TEXELS, [painted], 2, 2)).toBeCloseTo(1)
  })

  it('writes the whole delta and lets the mask hold it back at read time', () => {
    const { placed, disk, armed } = paintedArm(samples)
    const raised = raiseReliefDisk(samples, placed, undefined, disk, 1, 0, RELIEF_CHUNK_TEXELS)
    const bare: ReliefOverlay = { enabled: true, alpha: 1, sculpt: raised }
    const masked: ReliefOverlay = { ...bare, mask: armed.mask }
    const at = (overlay: ReliefOverlay, sx: number): number =>
      combinedAt(samples, RELIEF_CHUNK_TEXELS, [overlay], sx, 2)

    // Outside the mask nothing shows, and the delta is still there: reopening the mask gives the
    // stroke back. Applied at BOTH ends, a painted weight of 0.5 rendered 0.25 and never returned.
    expect(at(masked, 4)).toBeCloseTo(0)
    expect(at(bare, 4)).toBeGreaterThan(0)
    expect(at(masked, 2)).toBeCloseTo(at(bare, 2))
  })
})

function paintedMask(weights: ReliefSculpt): ReliefMask {
  return { kind: 'painted', weights }
}

function paintedArm(samples: { width: number; height: number; values: Float32Array }) {
  const placed = {
    origin: DEFAULT_RELIEF_ORIGIN,
    size: DEFAULT_RELIEF_SIZE,
    elevation: DEFAULT_RELIEF_ELEVATION,
  }
  const paint = withChunkDelta(samples, undefined, {
    column: 0,
    row: 0,
    localX: 2,
    localZ: 2,
    delta: 1,
  })
  return {
    placed,
    disk: {
      x: placed.origin.x + 2 * (placed.size.x / (samples.width - 1)),
      z: placed.origin.z + 2 * (placed.size.z / (samples.height - 1)),
      radius: placed.size.x,
    },
    armed: { alpha: 1, mask: paintedMask(paint) },
  }
}
