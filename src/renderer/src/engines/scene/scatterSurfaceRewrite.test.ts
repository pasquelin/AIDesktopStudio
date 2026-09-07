import { BoxGeometry, Mesh, MeshBasicMaterial, Object3D, Scene } from 'three'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_WORLD, scatterLayer } from '@shared/domain/scene'
import { createScatterSurface } from './scatterSurface'
import { createModelCache } from './modelCache'

function staticTree(): Object3D {
  const root = new Object3D()
  root.add(new Mesh(new BoxGeometry(0.4, 2, 0.4), new MeshBasicMaterial()))
  return root
}

describe('a scatter whose model was rewritten', () => {
  // Declared blind spot, out of this lot: the scatter acquires without a version, so a model ⌘S
  // rewrote is drawn from the copy it read until the layer is dropped and laid again.
  it('does not read the file again on the next sync', async () => {
    const load = vi.fn(async () => staticTree())
    const surface = createScatterSurface(new Scene(), {
      models: createModelCache(load, () => undefined),
      onUnsupported: () => undefined,
    })
    const layer = scatterLayer({
      id: 'trees',
      assets: [{ assetId: 'pine', weight: 1 }],
      origin: { x: 0, z: 0 },
      size: { x: 10, z: 10 },
    })
    await surface.sync({ ...DEFAULT_WORLD, layers: [layer] })
    await surface.sync({ ...DEFAULT_WORLD, layers: [{ ...layer, name: 'Forest' }] })

    expect(load).toHaveBeenCalledTimes(1)
    expect(load).toHaveBeenCalledWith('ai-desktop-studio://asset/pine')
    surface.dispose()
  })
})
