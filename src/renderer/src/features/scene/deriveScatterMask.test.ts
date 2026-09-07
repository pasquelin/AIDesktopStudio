// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { emptyGroundPaint } from '@shared/domain/groundPaint'
import { unpackDeltas } from '@shared/domain/relief'
import { DEFAULT_WORLD, reliefLayer, scatterLayer } from '@shared/domain/scene'
import { EMPTY_SCENE } from '@/engines/scene/sceneState'
import { setScatterMask } from '@/engines/scene/scatterCommands'
import { bridgeWatchingLogs } from '@/services/fakeBridge'
import { sceneOf, useScenes } from '@/stores/scenes'
import { deriveScatterMask } from './deriveScatterMask'

beforeEach(() => {
  useScenes.getState().replace('doc-1', {
    ...EMPTY_SCENE,
    world: {
      ...DEFAULT_WORLD,
      layers: [
        reliefLayer(
          { assetId: 'height' },
          {
            id: 'terrain',
            groundMaterials: [{ albedo: { assetId: 'ground' }, normal: null, channel: 'r' }],
            groundWeights: { assetId: 'ground' },
          },
        ),
        scatterLayer({ id: 'trees', grain: 2 }),
      ],
    },
  })
  bridgeWatchingLogs()
})

describe('automatic scatter generation', () => {
  it('derives from any requested material channel and leaves that source intact', async () => {
    const paint = emptyGroundPaint(2, 2)
    paint.pixels.set([0, 0, 255, 0], 0)
    const source = paint.pixels.slice()

    await expect(
      deriveScatterMask(
        'doc-1',
        'trees',
        {
          encode: async () => new Uint8Array(),
          decode: async () => paint,
        },
        'b',
      ),
    ).resolves.toBe(true)

    const derived = scatterMask()
    expect(unpackDeltas(derived?.weights.chunks[0]?.payload ?? '', 4)[0]).toBe(1)
    useScenes.getState().runCommand('doc-1', setScatterMask('trees', undefined))
    expect(scatterMask()).toBeUndefined()
    expect(paint.pixels).toEqual(source)
  })
})

function scatterMask() {
  const layer = sceneOf(useScenes.getState(), 'doc-1').world.layers.find(one => one.id === 'trees')
  return layer?.kind === 'scatter' && layer.mask?.kind === 'painted' ? layer.mask : undefined
}
