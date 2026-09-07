import { Texture } from 'three'
import { describe, expect, it, vi } from 'vitest'
import type { Asset } from '@shared/domain/asset'
import { installFakeBridge } from '@/services/fakeBridge'
import { createUnpackPass } from '@/engines/material/derive/unpackShaders'
import { PACKED_BY_SLOT, packedChannels, unpackMaterialChannels } from './unpackChannels'

const packed = (overrides: Partial<Asset> = {}): Asset => ({
  id: 'asset-orm',
  name: 'Robot — metallicRoughness',
  type: 'image',
  location: 'local',
  derivedFrom: 'asset-model',
  packedSlot: 'metallicRoughnessTexture',
  tags: [],
  createdAt: '2026-08-13T10:00:00.000Z',
  ...overrides,
})

const unpacked = () => Promise.resolve({ width: 2, height: 2, png: new Uint8Array([1]) })

describe('unpacking a packed picture', () => {
  /**
   * The whole reason `packedSlot` survives to the catalogue: a `clearcoatTexture` arrives with no
   * channel claimed too, and reading a roughness out of it would write a measurement of nothing.
   */
  it('offers nothing for a slot that packs no channel of the studio', () => {
    expect(packedChannels(packed({ packedSlot: 'clearcoatTexture' }))).toEqual([])
    expect(packedChannels(packed({ packedSlot: undefined }))).toEqual([])
  })

  it('names the two channels glTF packs into one picture', () => {
    expect(packedChannels(packed())).toEqual(['roughness', 'metalness'])
  })

  it('writes one asset per channel, each claiming the channel it holds', async () => {
    const saveTexture = vi.fn((request: { map?: string }) =>
      Promise.resolve(packed({ id: `asset-${request.map ?? ''}` })),
    )
    installFakeBridge({ assets: { saveTexture } })

    await expect(unpackMaterialChannels(packed(), unpacked)).resolves.toHaveLength(2)

    expect(saveTexture.mock.calls.map(([request]) => request.map)).toEqual([
      'roughness',
      'metalness',
    ])
  })

  // Traceable to what it came OUT of, never to the model: a second unpacking of the same file
  // must be tellable from the first, and the model already answers for the packed picture.
  it('files each one under the picture it was read from', async () => {
    const saveTexture = vi.fn((request: { derivedFrom?: string }) => {
      expect(request.derivedFrom).toBe('asset-orm')
      return Promise.resolve(packed())
    })
    installFakeBridge({ assets: { saveTexture } })

    await unpackMaterialChannels(packed(), unpacked)

    expect(saveTexture).toHaveBeenCalledTimes(2)
  })

  it('keeps the packed picture UV transform on every unpacked channel', async () => {
    const transform = {
      tiling: { x: 2, y: 3 },
      offset: { x: 0.25, y: 0.5 },
      rotation: 0.4,
    }
    installFakeBridge({
      assets: { saveTexture: request => Promise.resolve(packed({ map: request.map })) },
    })

    const result = await unpackMaterialChannels(packed({ textureTransform: transform }), unpacked)

    expect(result).toHaveLength(2)
    expect(result.every(asset => asset.textureTransform === transform)).toBe(true)
  })

  it('does nothing at all for a picture nothing says packs channels', async () => {
    const saveTexture = vi.fn(() => Promise.resolve(packed()))
    installFakeBridge({ assets: { saveTexture } })

    await expect(
      unpackMaterialChannels(packed({ packedSlot: 'clearcoatTexture' }), unpacked),
    ).resolves.toEqual([])
    expect(saveTexture).not.toHaveBeenCalled()
  })
})

/**
 * The list an unpacking OFFERS, held against the table the pass reads. A slot that named a
 * channel no component holds would be offered and then throw, mid-unpacking, after the earlier
 * channels had already landed in the project.
 */
describe('what a slot may be split into', () => {
  it('names only channels a component of a packed picture holds', () => {
    for (const channels of Object.values(PACKED_BY_SLOT)) {
      for (const channel of channels) {
        expect(() => createUnpackPass(channel, new Texture())).not.toThrow()
      }
    }
  })
})
