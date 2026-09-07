// @vitest-environment jsdom

import { BufferAttribute, type Material, Scene } from 'three'
import { describe, expect, it } from 'vitest'
import { RELIEF_CHUNK_TEXELS, chunkLayout, withChunkDelta } from '@shared/domain/relief'
import { DEFAULT_WORLD, reliefLayer, terrainEditLayer } from '@shared/domain/scene'
import { createReliefSurface, type ReliefSurface } from './reliefSurface'

const TERRAIN = 'terrain'
const WIDTH = RELIEF_CHUNK_TEXELS + 1
const HEIGHT = RELIEF_CHUNK_TEXELS + 1

const flatSamples = () => ({
  width: WIDTH,
  height: HEIGHT,
  values: Float32Array.from({ length: WIDTH * HEIGHT }, () => 0),
})

/**
 * With no accent token the painter falls back to black, so a fully painted vertex reads back as
 * `1 - weight * tint` — the gauge alone, which is what this measures.
 */
describe('how far a painted mask carries the accent', () => {
  it('softens the stencil by the ratio the theme publishes', () => {
    document.documentElement.style.setProperty('--sc-relief-mask-tint', '0.25')
    const samples = flatSamples()
    const weights = withChunkDelta(samples, undefined, {
      column: 0,
      row: 0,
      localX: 1,
      localZ: 0,
      delta: 1,
    })
    const surface = createReliefSurface(new Scene(), { maskTint: true })

    surface.sync(
      {
        ...DEFAULT_WORLD,
        layers: [
          reliefLayer(
            { assetId: 'asset_height' },
            {
              id: TERRAIN,
              edits: [terrainEditLayer({ id: 'sculpt', mask: { kind: 'painted', weights } })],
            },
          ),
        ],
      },
      samples,
    )

    const mesh = surface.meshOf(TERRAIN, 0, 0)
    const color = mesh?.geometry.getAttribute('color')
    if (!(color instanceof BufferAttribute)) throw new Error('chunk has no color buffer')
    const layout = chunkLayout(0, 0, WIDTH, HEIGHT, RELIEF_CHUNK_TEXELS)

    expect(color.array[layout.width * 0 * 3 + 3]).toBeCloseTo(0.75, 5)
    surface.dispose()
  })
})

describe('when the mask tint is drawn at all', () => {
  it('draws it only where it was asked for, and answers what it was showing', () => {
    const samples = flatSamples()
    const worldWith = (ids: readonly string[]) => ({
      ...DEFAULT_WORLD,
      layers: ids.map(id => reliefLayer({ assetId: `asset_${id}` }, { id })),
    })
    const materialOf = (surface: ReliefSurface, terrainId: string): Material => {
      const material = surface.meshOf(terrainId, 0, 0)?.material
      if (!material || Array.isArray(material)) throw new Error('chunk has no material')
      return material
    }
    const played = createReliefSurface(new Scene())
    const studio = createReliefSurface(new Scene(), { maskTint: true })

    played.sync(worldWith(['held']), samples)
    studio.sync(worldWith(['held']), samples)

    expect(materialOf(played, 'held').vertexColors).toBe(false)
    expect(materialOf(studio, 'held').vertexColors).toBe(true)
    // Not merely unshown: a chunk nobody will tint uploads no colour buffer at all.
    expect(played.meshOf('held', 0, 0)?.geometry.getAttribute('color')).toBeUndefined()

    const was = studio.showMaskTint?.(false)
    // Synced after the tint went off, so it clones the flag as it stands rather than the default.
    studio.sync(worldWith(['held', 'later']), samples)

    expect(was).toBe(true)
    expect(materialOf(studio, 'held').vertexColors).toBe(false)
    expect(materialOf(studio, 'later').vertexColors).toBe(false)
    expect(studio.showMaskTint?.(true)).toBe(false)
    expect(materialOf(studio, 'held').vertexColors).toBe(true)
    expect(materialOf(studio, 'later').vertexColors).toBe(true)
    // A surface never asked to tint stays out of it, its chunks having no colour to sample.
    expect(played.showMaskTint?.(true)).toBe(false)
    expect(materialOf(played, 'held').vertexColors).toBe(false)
    played.dispose()
    studio.dispose()
  })
})
