import { BoxGeometry, Float32BufferAttribute, Mesh, MeshStandardMaterial, Object3D } from 'three'
import { describe, expect, it, vi } from 'vitest'
import { SceneRenderer } from './SceneRenderer'
import { modelNodeFixture } from './scene-fixtures'
import { EMPTY_SCENE } from './sceneState'

/** A file carrying two shapes on one mesh, the way `GLTFLoader` hands one back. */
function smiling(): Object3D {
  const geometry = new BoxGeometry()
  geometry.morphAttributes.position = ['smile', 'blink'].map(
    () =>
      new Float32BufferAttribute(new Float32Array(geometry.getAttribute('position').count * 3), 3),
  )
  const mesh = new Mesh(geometry, new MeshStandardMaterial())
  mesh.updateMorphTargets()
  mesh.morphTargetDictionary = { smile: 0, blink: 1 }
  return new Object3D().add(mesh)
}

describe('the shapes a model carries', () => {
  it('names them once the file lands, and weighs only the one the model really carries', async () => {
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

    expect(renderer.setMorphInfluence('hero', 'smile', 0.5)).toBe(true)
    expect(renderer.setMorphInfluence('hero', 'frown', 0.5)).toBe(false)
    expect(renderer.setMorphInfluence('nobody', 'smile', 0.5)).toBe(false)
    renderer.dispose()
  })
})
