import { describe, expect, it, vi } from 'vitest'
import { emptyGroundWeights } from '@shared/domain/groundPaint'
import { DEFAULT_WORLD, reliefLayer } from '@shared/domain/scene'
import { createSceneGroundPaintSession } from './sceneGroundPaintSession'

const disk = { x: 1, z: 0, radius: 0, amount: 1, falloff: 0 }

describe('a ground-paint session', () => {
  it('keeps the in-flight paint when the persisted weights id changes', async () => {
    const load = vi.fn(async () => emptyGroundWeights(3, 3))
    let world = worldWithWeights('weights-1')
    const session = createSceneGroundPaintSession({
      world: () => world,
      load,
      apply: vi.fn(),
    })

    await expect(session.paint('terrain', disk, 'r')).resolves.toBe(true)
    world = worldWithWeights('weights-2')
    session.rebind(world)
    await expect(session.paint('terrain', disk, 'g')).resolves.toBe(true)

    expect(load).toHaveBeenCalledOnce()
  })
})

function worldWithWeights(assetId: string) {
  return {
    ...DEFAULT_WORLD,
    layers: [
      reliefLayer(
        { assetId: 'height' },
        {
          id: 'terrain',
          groundMaterials: [{ albedo: { assetId: 'ground' }, normal: null, channel: 'r' }],
          groundWeights: { assetId },
        },
      ),
    ],
  }
}
