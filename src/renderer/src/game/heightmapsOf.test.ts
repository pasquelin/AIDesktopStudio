import { describe, expect, it } from 'vitest'
import { DEFAULT_WORLD, reliefLayer } from '@shared/domain/scene'
import { heightmapsOf } from './heightmapsOf'

describe('the heightmaps a scene names', () => {
  it('loads the asset each relief layer points at, once', async () => {
    const samples = { width: 2, height: 2, values: new Float32Array(4) }
    const asked: string[] = []
    const load = async (assetId: string) => {
      asked.push(assetId)
      return samples
    }
    const layers = [
      reliefLayer({ assetId: 'asset_height' }, { id: 'isle' }),
      reliefLayer({ assetId: 'asset_height' }, { id: 'range' }),
    ]

    const maps = await heightmapsOf(layers, load)

    expect(asked).toEqual(['asset_height'])
    expect(maps.get('asset_height')).toBe(samples)
  })

  it('leaves out a file that would not decode, so Play still starts', async () => {
    const maps = await heightmapsOf(
      [reliefLayer({ assetId: 'missing' }, { id: 'terrain' })],
      async () => {
        throw new Error('not OpenEXR')
      },
    )

    expect(maps.size).toBe(0)
  })

  it('asks nothing of a scene with no relief', async () => {
    const asked: string[] = []
    await heightmapsOf(DEFAULT_WORLD.layers, async assetId => {
      asked.push(assetId)
      return { width: 2, height: 2, values: new Float32Array(4) }
    })

    expect(asked).toEqual([])
  })
})
