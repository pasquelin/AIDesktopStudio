import { Scene } from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  RELIEF_CHUNK_TEXELS,
  raiseReliefDisk,
  reliefReader,
  type ReliefSculpt,
} from '@shared/domain/relief'
import {
  DEFAULT_RELIEF_ELEVATION,
  DEFAULT_RELIEF_ORIGIN,
  DEFAULT_RELIEF_SIZE,
  DEFAULT_WORLD,
  reliefLayer,
  terrainEditLayer,
} from '@shared/domain/scene'
import { createReliefSurface } from './reliefSurface'

const EXTENT = {
  origin: DEFAULT_RELIEF_ORIGIN,
  size: DEFAULT_RELIEF_SIZE,
  elevation: DEFAULT_RELIEF_ELEVATION,
}

const WIDTH = 66
const HEIGHT = 66

function samplesOf() {
  return {
    width: WIDTH,
    height: HEIGHT,
    values: Float32Array.from({ length: WIDTH * HEIGHT }, (_, at) => (at % WIDTH) * 0.01),
  }
}

/** A stroke wide enough to dirty every one of the four chunks a 66×66 map is cut into. */
function sculptOf(): ReliefSculpt {
  return raiseReliefDisk(samplesOf(), EXTENT, undefined, { x: 0, z: 0, radius: 40 }, 1.5)
}

afterEach(() => vi.restoreAllMocks())

describe('what one relief rebuild costs to decode', () => {
  it('decodes each chunk once, whatever the number of samples read', () => {
    const sculpt = sculptOf()
    const decode = vi.spyOn(globalThis, 'atob')

    const read = reliefReader(samplesOf(), RELIEF_CHUNK_TEXELS, [
      { enabled: true, alpha: 1, sculpt },
    ])
    for (let sz = 0; sz < HEIGHT; sz++) for (let sx = 0; sx < WIDTH; sx++) read(sx, sz)

    expect(decode.mock.calls.length).toBe(sculpt.chunks.length)
  })

  it('decodes nothing until a sample is asked for', () => {
    const sculpt = sculptOf()
    const decode = vi.spyOn(globalThis, 'atob')

    reliefReader(samplesOf(), RELIEF_CHUNK_TEXELS, [{ enabled: true, alpha: 1, sculpt }])

    expect(decode).not.toHaveBeenCalled()
  })

  it('builds the whole surface without a decode per vertex', () => {
    const sculpt = sculptOf()
    const decode = vi.spyOn(globalThis, 'atob')

    const surface = createReliefSurface(new Scene())
    surface.sync(
      {
        ...DEFAULT_WORLD,
        layers: [
          reliefLayer(
            { assetId: 'asset_height' },
            { id: 'terrain', edits: [terrainEditLayer({ id: 'sculpt', sculpt })] },
          ),
        ],
      },
      samplesOf(),
    )

    // One decode per (mesh, chunk it touches): its own, plus the neighbours the normals read a
    // 1-ring into. Never a multiple of the 4 356 vertices those meshes carry.
    expect(decode.mock.calls.length).toBeLessThanOrEqual(sculpt.chunks.length ** 2)
    surface.dispose()
  })
})
