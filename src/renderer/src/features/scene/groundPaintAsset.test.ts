// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { bytesFromBase64 } from '@shared/base64'
import { emptyGroundPaint, type GroundPaint } from '@shared/domain/groundPaint'
import { DEFAULT_WORLD, reliefLayer } from '@shared/domain/scene'
import type { Asset } from '@shared/domain/asset'
import { bridgeWatchingLogs } from '@/services/fakeBridge'
import { useAssets } from '@/stores/assets'
import { sceneOf, useScenes } from '@/stores/scenes'
import { EMPTY_SCENE } from '@/engines/scene/sceneState'
import { loadGroundPaint, saveGroundPaint, type GroundPaintCodec } from './groundPaintAsset'

const picture = (id: string): Asset => ({
  id,
  name: 'Ground.png',
  type: 'image',
  location: 'local',
  path: `Images/${id}.png`,
  tags: [],
  createdAt: '2026-09-04T00:00:00.000Z',
})

beforeEach(() => {
  useScenes.getState().replace('doc-1', {
    ...EMPTY_SCENE,
    world: {
      ...DEFAULT_WORLD,
      layers: [reliefLayer({ assetId: 'height' }, { id: 'terrain', name: 'Island' })],
    },
  })
  useAssets.setState({ items: [] })
})

describe('ground paint assets', () => {
  it('round-trips the painted RGBA bytes through the referenced project picture', async () => {
    const stored = new Map<string, GroundPaint>()
    const codec: GroundPaintCodec = {
      encode: async paint => {
        stored.set('paint-1', { ...paint, pixels: paint.pixels.slice() })
        return Uint8Array.from(paint.pixels)
      },
      decode: async assetId => {
        const paint = stored.get(assetId)
        if (!paint) throw new Error('missing paint')
        return { ...paint, pixels: paint.pixels.slice() }
      },
    }
    const savePicture = vi.fn(async request => {
      expect([...bytesFromBase64(request.png)]).toEqual([...paint.pixels])
      expect(request).not.toHaveProperty('replaces')
      return picture('paint-1')
    })
    bridgeWatchingLogs({
      assets: { savePicture, search: async () => [picture('paint-1')] },
    })
    const paint = emptyGroundPaint(2, 2)
    paint.pixels.set([12, 140, 32, 255], 4)

    await expect(saveGroundPaint('doc-1', 'terrain', paint, codec)).resolves.toBe(true)
    await expect(loadGroundPaint('doc-1', 'terrain', codec)).resolves.toEqual(paint)
    const terrain = sceneOf(useScenes.getState(), 'doc-1').world.layers[0]
    expect(terrain?.kind === 'relief' ? terrain.groundMaterials : []).toEqual([])
    expect(terrain?.kind === 'relief' ? terrain.groundWeights : null).toEqual({
      assetId: 'paint-1',
    })
  })

  it('creates a derived picture and preserves the reserved material layers', async () => {
    const terrain = reliefLayer(
      { assetId: 'height' },
      {
        id: 'terrain',
        name: 'Island',
        groundMaterials: [
          { albedo: { assetId: 'source' }, normal: null, channel: 'r' },
          { albedo: { assetId: 'detail' }, normal: null, channel: 'g' },
        ],
        groundWeights: { assetId: 'weights-before' },
      },
    )
    useScenes.getState().replace('doc-1', {
      ...EMPTY_SCENE,
      world: { ...DEFAULT_WORLD, layers: [terrain] },
    })
    const requests: unknown[] = []
    const savePicture = vi.fn(async (request: unknown) => {
      requests.push(request)
      return picture('paint-1')
    })
    bridgeWatchingLogs({ assets: { savePicture, search: async () => [picture('paint-1')] } })
    const codec: GroundPaintCodec = {
      encode: async () => new Uint8Array(),
      decode: async () => emptyGroundPaint(1, 1),
    }

    await expect(saveGroundPaint('doc-1', 'terrain', emptyGroundPaint(1, 1), codec)).resolves.toBe(
      true,
    )

    expect(requests[0]).toMatchObject({ derivedFrom: 'weights-before' })
    expect(requests[0]).not.toHaveProperty('replaces')
    const stored = sceneOf(useScenes.getState(), 'doc-1').world.layers[0]
    expect(stored?.kind === 'relief' ? stored.groundMaterials : []).toEqual([
      { albedo: { assetId: 'source' }, normal: null, channel: 'r' },
      { albedo: { assetId: 'detail' }, normal: null, channel: 'g' },
    ])
    expect(stored?.kind === 'relief' ? stored.groundWeights : null).toEqual({
      assetId: 'paint-1',
    })
  })
})
