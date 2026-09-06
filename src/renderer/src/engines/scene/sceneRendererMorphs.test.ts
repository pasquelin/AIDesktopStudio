import { Object3D } from 'three'
import { describe, expect, it, vi } from 'vitest'
import { SceneRenderer } from './SceneRenderer'
import { modelNodeFixture, morphedMesh } from './scene-fixtures'
import { EMPTY_SCENE } from './sceneState'

const smiling = (): Object3D => new Object3D().add(morphedMesh('smile', 'blink'))

describe('the shapes a model carries', () => {
  it('names them once the file lands, and weighs only the ones the model really carries', async () => {
    const onMorphs = vi.fn()
    const renderer = new SceneRenderer({
      onSelect: vi.fn(),
      onTransform: vi.fn(),
      loadModel: async () => smiling(),
      onMorphs,
    })

    renderer.apply({
      ...EMPTY_SCENE,
      nodes: [modelNodeFixture('hero', 'asset-hero')],
      selectedIds: [],
    })
    await vi.waitFor(() => expect(onMorphs).toHaveBeenCalledWith('hero', ['smile', 'blink']))

    expect(renderer.setMorphInfluences('hero', { smile: 0.5, frown: 0.5 })).toBe(1)
    expect(renderer.setMorphInfluences('nobody', { smile: 0.5 })).toBe(0)
    renderer.dispose()
  })
})
