import { describe, expect, it, vi } from 'vitest'
import { chunkCountAlong, chunkLayout, packDeltas } from './relief'
import { scatterLayer, SCATTER_MASK_TEXELS } from './scatter'
import { layerRegion } from './scatterFollow'
import { scatterHash, scatterPosesOf } from './scatterGenerate'
import { FLAT_SCATTER_GROUND } from './scatterGround'

describe('painted scatter mask sampling', () => {
  it('uses edited fractional weights on the next generation without retaining decoded chunks', () => {
    const packed = {
      column: 0,
      row: 0,
      payload: packDeltas(new Float32Array(SCATTER_MASK_TEXELS ** 2).fill(1)),
    }
    const layer = scatterLayer({
      id: 'trees',
      grain: 256,
      size: { x: 32, z: 32 },
      assets: [{ assetId: 'tree', weight: 1 }],
      mask: { kind: 'painted', weights: { chunks: [packed] } },
    })
    const region = layerRegion(layer)
    const full = scatterPosesOf(layer, region, FLAT_SCATTER_GROUND)
    expect(full.length).toBeGreaterThan(0)
    packed.payload = packDeltas(new Float32Array(SCATTER_MASK_TEXELS ** 2).fill(0.5))
    const expected = full.filter(
      pose =>
        scatterHash(
          layer.seed,
          Math.floor(pose.x / layer.rules.spacing),
          Math.floor(pose.z / layer.rules.spacing),
          4,
        ) < 0.5,
    )
    expect(expected.length).toBeGreaterThan(0)
    expect(expected.length).toBeLessThan(full.length)
    expect(scatterPosesOf(layer, region, FLAT_SCATTER_GROUND)).toEqual(expected)
    packed.payload = packDeltas(new Float32Array(SCATTER_MASK_TEXELS ** 2))
    expect(scatterPosesOf(layer, region, FLAT_SCATTER_GROUND)).toEqual([])
  })

  it('preserves every placement while decoding each visited mask chunk only once', () => {
    const layer = scatterLayer({
      id: 'trees',
      size: { x: 256, z: 256 },
      assets: [{ assetId: 'tree', weight: 1 }],
    })
    const chunks = []
    const count = chunkCountAlong(SCATTER_MASK_TEXELS, layer.grain)
    for (let row = 0; row < count; row++) {
      for (let column = 0; column < count; column++) {
        const layout = chunkLayout(
          column,
          row,
          SCATTER_MASK_TEXELS,
          SCATTER_MASK_TEXELS,
          layer.grain,
        )
        chunks.push({
          column,
          row,
          payload: packDeltas(new Float32Array(layout.width * layout.height).fill(1)),
        })
      }
    }
    const expected = scatterPosesOf(layer, layerRegion(layer), FLAT_SCATTER_GROUND)
    const decode = vi.spyOn(globalThis, 'atob')
    try {
      const actual = scatterPosesOf(
        { ...layer, mask: { kind: 'painted', weights: { chunks } } },
        layerRegion(layer),
        FLAT_SCATTER_GROUND,
      )
      expect(actual).toEqual(expected)
      expect(actual.length).toBeGreaterThan(chunks.length)
      expect(decode).toHaveBeenCalledTimes(chunks.length)
    } finally {
      decode.mockRestore()
    }
  })
})
