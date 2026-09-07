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

  it('keeps a preview requested while the model is still loading', async () => {
    let settle = (source: Object3D): void => void source
    const loading = new Promise<Object3D>(resolve => {
      settle = resolve
    })
    const onMorphs = vi.fn()
    const renderer = new SceneRenderer({
      onSelect: vi.fn(),
      onTransform: vi.fn(),
      loadModel: () => loading,
      onMorphs,
    })

    renderer.apply({
      ...EMPTY_SCENE,
      nodes: [modelNodeFixture('hero', 'asset-hero')],
      selectedIds: [],
    })
    expect(renderer.setMorphInfluences('hero', { smile: 0.75 })).toBe(0)

    settle(smiling())
    await vi.waitFor(() => expect(onMorphs).toHaveBeenCalledWith('hero', ['smile', 'blink']))

    const holder = (renderer as unknown as { objects: ReadonlyMap<string, Object3D> }).objects.get(
      'hero',
    )
    const face = holder?.children[0]?.children[0]
    expect(face).toMatchObject({ morphTargetInfluences: [0.75, 0] })
    renderer.dispose()
  })

  it('keeps the preview when the model file is reloaded', async () => {
    let version = 'a'
    const onMorphs = vi.fn()
    const renderer = new SceneRenderer({
      onSelect: vi.fn(),
      onTransform: vi.fn(),
      loadModel: async () => smiling(),
      assetVersion: () => version,
      onMorphs,
    })

    renderer.apply({
      ...EMPTY_SCENE,
      nodes: [modelNodeFixture('hero', 'asset-hero')],
      selectedIds: [],
    })
    await vi.waitFor(() => expect(onMorphs).toHaveBeenCalledTimes(1))
    expect(renderer.setMorphInfluences('hero', { smile: 0.75 })).toBe(1)

    version = 'b'
    renderer.refreshModels()
    await vi.waitFor(() => expect(onMorphs).toHaveBeenCalledTimes(2))

    const holder = (renderer as unknown as { objects: ReadonlyMap<string, Object3D> }).objects.get(
      'hero',
    )
    const face = holder?.children[0]?.children[0]
    expect(face).toMatchObject({ morphTargetInfluences: [0.75, 0] })
    renderer.dispose()
  })
})
