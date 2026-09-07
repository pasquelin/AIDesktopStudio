import { describe, expect, it } from 'vitest'
import { RELIEF_CHUNK_TEXELS, combinedAt, withChunkDelta, worldY } from '@shared/domain/relief'
import { reliefLayer, terrainEditLayer } from '@shared/domain/scene'
import { colliderFromRelief } from './colliderFromRelief'

const WIDTH = 4
const HEIGHT = 4

function samplesOf(fill: number) {
  return {
    width: WIDTH,
    height: HEIGHT,
    values: new Float32Array(WIDTH * HEIGHT).fill(fill),
  }
}

describe('what a relief is felt as', () => {
  it('lifts each sample by the elevation the layer names, not the raw texel', () => {
    const samples = samplesOf(0.5)
    const layer = reliefLayer(
      { assetId: 'asset_height' },
      { id: 'terrain', size: { x: 9, z: 9 }, elevation: { min: 0, max: 10 } },
    )

    const shape = colliderFromRelief(layer, samples)

    expect(shape?.kind).toBe('heightfield')
    expect(shape?.kind === 'heightfield' ? shape.heights[0] : 0).toBeCloseTo(5)
    expect(shape?.kind === 'heightfield' ? shape.scale.x : 0).toBeCloseTo(3)
    expect(shape?.kind === 'heightfield' ? shape.offset : null).toEqual({ x: 0, y: 0, z: 0 })
  })

  it('places the grid at the layer origin, with a scale that spans the rectangle', () => {
    const samples = { width: 4, height: 3, values: new Float32Array(12) }
    const layer = reliefLayer(
      { assetId: 'asset_height' },
      { id: 'terrain', origin: { x: 10, z: -4 }, size: { x: 9, z: 6 } },
    )

    const shape = colliderFromRelief(layer, samples)

    expect(shape?.kind === 'heightfield' ? shape.offset : null).toEqual({ x: 10, y: 0, z: -4 })
    expect(shape?.kind === 'heightfield' ? shape.scale : null).toEqual({ x: 3, y: 1, z: 3 })
    expect(shape?.kind === 'heightfield' ? shape.width : 0).toBe(4)
    expect(shape?.kind === 'heightfield' ? shape.height : 0).toBe(3)
  })

  it('feels a sculpted delta, not the base heightmap alone', () => {
    const samples = samplesOf(0.5)
    const sculpt = withChunkDelta(samples, undefined, {
      column: 0,
      row: 0,
      localX: 1,
      localZ: 1,
      delta: 0.25,
    })
    const layer = reliefLayer(
      { assetId: 'asset_height' },
      {
        id: 'terrain',
        elevation: { min: 0, max: 1 },
        edits: [terrainEditLayer({ id: 'sculpt', sculpt })],
      },
    )

    const shape = colliderFromRelief(layer, samples)
    const heights = shape?.kind === 'heightfield' ? shape.heights : new Float32Array()

    expect(heights[1 * WIDTH + 1]).toBeCloseTo(
      worldY(
        combinedAt(samples, RELIEF_CHUNK_TEXELS, [{ enabled: true, alpha: 1, sculpt }], 1, 1),
        layer.elevation,
      ),
    )
    expect(heights[0]).toBeCloseTo(
      worldY(combinedAt(samples, RELIEF_CHUNK_TEXELS, [], 0, 0), layer.elevation),
    )
    expect(heights[1 * WIDTH + 1]).not.toBeCloseTo(heights[0] ?? 0)
  })
})
