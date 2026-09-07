import { describe, expect, it } from 'vitest'
import {
  worldY,
  sampleOfWorldY,
  RELIEF_CHUNK_TEXELS,
  chunkCountAlong,
  chunkLayout,
  chunkMemoryBytes,
  chunkVerticesPerSide,
  combinedAt,
  containsXZ,
  getHeightAt,
  packDeltas,
  regionUploadBytes,
  unpackDeltas,
  withChunkDelta,
  type ReliefHeightLayer,
  type ReliefSculpt,
} from './relief'
import { DEFAULT_RELIEF_ELEVATION, reliefLayer } from './scene'

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

describe('relief chunk grain', () => {
  it('is 64 texels, the candidate whose full-chunk fallback is four times lighter', () => {
    expect(RELIEF_CHUNK_TEXELS).toBe(64)
    // 65² vertices: 50 700 each for position, normal and the painted-mask tint, 33 800 of uv,
    // 49 152 of index. The tint was missing from the total until 2026-09-05, 27,5 % short.
    expect(chunkMemoryBytes(64)).toMatchObject({
      position: 50_700,
      normal: 50_700,
      color: 50_700,
      uv: 33_800,
      index: 49_152,
      total: 235_052,
    })
    expect(chunkMemoryBytes(128).total / chunkMemoryBytes(64).total).toBeCloseTo(4, 0)
  })

  it('counts the shared border vertex, so 64 quads are 65 vertices on a side', () => {
    expect(chunkVerticesPerSide(64)).toBe(65)
    expect(chunkCountAlong(512, 64)).toBe(8)
    expect(chunkCountAlong(512, 128)).toBe(4)
  })

  it('uploads a 16-texel brush as a region, not a chunk', () => {
    const brush = regionUploadBytes(32, 32)
    expect(brush.total).toBeLessThan(chunkMemoryBytes(64).position)
    expect(brush.total).toBeLessThan(chunkMemoryBytes(128).position / 4)
  })
})

describe('relief chunk deltas', () => {
  const samples = {
    width: 8,
    height: 8,
    values: Float32Array.from({ length: 64 }, (_, at) => at * 0.1),
  }

  it('adds a delta to the combined height at that sample, leaving the base alone', () => {
    const sculpt = withChunkDelta(samples, undefined, {
      column: 0,
      row: 0,
      localX: 2,
      localZ: 1,
      delta: 3,
    })

    expect(heightAt(samples, sculpt, 2, 1)).toBeCloseTo(4)
    expect(samples.values[1 * 8 + 2]).toBeCloseTo(1.0)
    expect(heightAt(samples, undefined, 2, 1)).toBeCloseTo(1.0)
  })

  it('packs a sparse overlay as base64, not a JSON array of floats', () => {
    const sculpt = withChunkDelta(samples, undefined, {
      column: 0,
      row: 0,
      localX: 0,
      localZ: 0,
      delta: 1.5,
    })
    const json = JSON.stringify(sculpt)

    expect(sculpt.chunks[0]?.payload).toMatch(/^[A-Za-z0-9+/]+=*$/)
    expect(json).not.toMatch(/1\.5/)
    expect(JSON.parse(json)).toEqual(sculpt)
  })

  it('packs a fully dirtied chunk as dense binary, still not JSON floats', () => {
    const layout = chunkLayout(0, 0, 8, 8, RELIEF_CHUNK_TEXELS)
    const deltas = new Float32Array(layout.width * layout.height)
    deltas.fill(0.25)
    const payload = packDeltas(deltas)
    const json = JSON.stringify({ payload })

    expect(unpackDeltas(payload, deltas.length)).toEqual(deltas)
    expect(json).not.toMatch(/0\.25/)
    expect(atob(payload).charCodeAt(0)).toBe(1)
  })
})

describe('worldY', () => {
  it('maps sample 0 and 1 onto elevation.min and elevation.max', () => {
    expect(worldY(0, { min: -8, max: 32 })).toBe(-8)
    expect(worldY(1, { min: -8, max: 32 })).toBe(32)
    expect(worldY(0.5, { min: 0, max: 1 })).toBe(0.5)
  })

  it('inverts through sampleOfWorldY', () => {
    const elevation = { min: -8, max: 32 }
    expect(sampleOfWorldY(worldY(0.25, elevation), elevation)).toBeCloseTo(0.25)
    expect(sampleOfWorldY(10, { min: 10, max: 10 })).toBe(0)
  })
})

describe('combined overlays', () => {
  const samples = {
    width: 8,
    height: 8,
    values: Float32Array.from({ length: 64 }, (_, at) => at * 0.1),
  }

  function overlay(
    sculpt: ReliefSculpt,
    extra: { enabled?: boolean; alpha?: number } = {},
  ): { enabled: boolean; alpha: number; sculpt: ReliefSculpt } {
    return { enabled: extra.enabled ?? true, alpha: extra.alpha ?? 1, sculpt }
  }

  const hills = withChunkDelta(samples, undefined, {
    column: 0,
    row: 0,
    localX: 2,
    localZ: 1,
    delta: 3,
  })
  const valley = withChunkDelta(samples, undefined, {
    column: 0,
    row: 0,
    localX: 2,
    localZ: 1,
    delta: 1,
  })

  it('sums enabled overlays, each scaled by its alpha', () => {
    expect(
      combinedAt(
        samples,
        RELIEF_CHUNK_TEXELS,
        [overlay(hills), overlay(valley, { alpha: 0.5 })],
        2,
        1,
      ),
    ).toBeCloseTo(1.0 + 3 + 0.5)
  })

  it('skips a disabled overlay, leaving the others', () => {
    expect(
      combinedAt(
        samples,
        RELIEF_CHUNK_TEXELS,
        [overlay(hills, { enabled: false }), overlay(valley)],
        2,
        1,
      ),
    ).toBeCloseTo(1.0 + 1)
  })

  it('subtracts when alpha is negative', () => {
    expect(
      combinedAt(samples, RELIEF_CHUNK_TEXELS, [overlay(hills, { alpha: -1 })], 2, 1),
    ).toBeCloseTo(1.0 - 3)
  })
})

describe('containsXZ', () => {
  const extent = {
    origin: { x: 0, z: -4 },
    size: { x: 10, z: 6 },
    elevation: DEFAULT_RELIEF_ELEVATION,
  }

  it('includes the origin and the far edge, and refuses a point past either', () => {
    expect(containsXZ(extent, 0, -4)).toBe(true)
    expect(containsXZ(extent, 10, 2)).toBe(true)
    expect(containsXZ(extent, -0.01, 0)).toBe(false)
    expect(containsXZ(extent, 10.01, 0)).toBe(false)
    expect(containsXZ(extent, 5, 2.01)).toBe(false)
  })
})

describe('getHeightAt', () => {
  const quad: ReliefHeightLayer = {
    ...reliefLayer({ assetId: 'h' }, { id: 'quad', size: { x: 1, z: 1 } }),
    samples: { width: 2, height: 2, values: Float32Array.from([0, 4, 8, 12]) },
  }

  it('interpolates the four neighbouring texels at a point off the grid', () => {
    expect(getHeightAt([quad], 0.25, 0.5)).toBeCloseTo(5)
  })

  it('returns null when no enabled terrain contains the point', () => {
    expect(getHeightAt([quad], -1, 0.5)).toBeNull()
    expect(getHeightAt([{ ...quad, enabled: false }], 0.25, 0.5)).toBeNull()
  })

  it('reads the combined height, so a sculpted overlay is felt', () => {
    const painted: ReliefHeightLayer = {
      ...quad,
      edits: [
        {
          enabled: true,
          alpha: 1,
          sculpt: withChunkDelta(quad.samples, undefined, {
            column: 0,
            row: 0,
            localX: 0,
            localZ: 0,
            delta: 1,
          }),
        },
      ],
    }
    expect(getHeightAt([painted], 0, 0)).toBeCloseTo(1)
  })

  it('lets the first overlapping terrain in the list answer, not the second', () => {
    const low: ReliefHeightLayer = {
      ...reliefLayer(
        { assetId: 'low' },
        { origin: { x: 0, z: 0 }, size: { x: 10, z: 10 }, id: 'low' },
      ),
      samples: { width: 2, height: 2, values: new Float32Array(4).fill(0.2) },
    }
    const high: ReliefHeightLayer = {
      ...reliefLayer(
        { assetId: 'high' },
        { origin: { x: 0, z: 0 }, size: { x: 10, z: 10 }, id: 'high' },
      ),
      samples: { width: 2, height: 2, values: new Float32Array(4).fill(0.8) },
    }

    expect(getHeightAt([low, high], 5, 5)).toBeCloseTo(0.2)
    expect(getHeightAt([high, low], 5, 5)).toBeCloseTo(0.8)
  })
})
