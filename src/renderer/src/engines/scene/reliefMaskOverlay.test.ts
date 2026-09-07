import { BufferAttribute, Scene } from 'three'
import { describe, expect, it } from 'vitest'
import {
  RELIEF_CHUNK_TEXELS,
  chunkLayout,
  withChunkDelta,
  type ReliefMask,
} from '@shared/domain/relief'
import { DEFAULT_WORLD, reliefLayer, terrainEditLayer } from '@shared/domain/scene'
import { createReliefSurface } from './reliefSurface'

const TERRAIN = 'terrain'
const WIDTH = 66
const HEIGHT = 8

function samplesOf() {
  return {
    width: WIDTH,
    height: HEIGHT,
    values: Float32Array.from({ length: WIDTH * HEIGHT }, (_, at) => (at % WIDTH) * 0.01),
  }
}

function worldOf(mask?: ReliefMask) {
  return {
    ...DEFAULT_WORLD,
    layers: [
      reliefLayer(
        { assetId: 'asset_height' },
        { id: TERRAIN, edits: [terrainEditLayer({ id: 'sculpt', mask })] },
      ),
    ],
  }
}

function colorAt(
  surface: ReturnType<typeof createReliefSurface>,
  localX: number,
  localZ: number,
): [number, number, number] {
  const mesh = surface.meshOf(TERRAIN, 0, 0)
  const color = mesh?.geometry.getAttribute('color')
  if (!(color instanceof BufferAttribute)) throw new Error('chunk has no color buffer')
  const layout = chunkLayout(0, 0, WIDTH, HEIGHT, RELIEF_CHUNK_TEXELS)
  const at = (localZ * layout.width + localX) * 3
  return [color.array[at] ?? 0, color.array[at + 1] ?? 0, color.array[at + 2] ?? 0]
}

function heightAt(surface: ReturnType<typeof createReliefSurface>, localX: number): number {
  const mesh = surface.meshOf(TERRAIN, 0, 0)
  const position = mesh?.geometry.getAttribute('position')
  if (!(position instanceof BufferAttribute)) throw new Error('chunk has no position buffer')
  const layout = chunkLayout(0, 0, WIDTH, HEIGHT, RELIEF_CHUNK_TEXELS)
  return position.array[(0 * layout.width + localX) * 3 + 1] ?? 0
}

describe('a painted mask overlay on a drawn terrain', () => {
  it('tints vertices the mask covers even when the sculpt is empty', () => {
    const samples = samplesOf()
    const surface = createReliefSurface(new Scene(), { maskTint: true })
    surface.sync(worldOf({ kind: 'painted', weights: { chunks: [] } }), samples)
    const uncovered = colorAt(surface, 4, 0)
    expect(uncovered).toEqual([1, 1, 1])
    expect(heightAt(surface, 1)).toBeCloseTo(0.01)

    const weights = withChunkDelta(samples, undefined, {
      column: 0,
      row: 0,
      localX: 1,
      localZ: 0,
      delta: 1,
    })
    surface.sync(worldOf({ kind: 'painted', weights }), samples)

    expect(heightAt(surface, 1)).toBeCloseTo(0.01)
    const covered = colorAt(surface, 1, 0)
    expect(covered[0]).toBeLessThan(1)
    expect(colorAt(surface, 4, 0)).toEqual([1, 1, 1])
    surface.dispose()
  })

  it('leaves a terrain with no painted mask untouched', () => {
    const surface = createReliefSurface(new Scene(), { maskTint: true })

    surface.sync(worldOf(), samplesOf())

    // A raise dab on a terrain nobody painted rewrote 12 675 floats of white per dirtied chunk.
    expect(surface.meshOf(TERRAIN, 0, 0)?.geometry.getAttribute('color')).toBeUndefined()
    surface.dispose()
  })
})
