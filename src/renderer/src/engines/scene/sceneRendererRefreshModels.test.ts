import { BoxGeometry, Mesh, MeshStandardMaterial, Object3D } from 'three'
import { describe, expect, it, vi } from 'vitest'
import { SceneRenderer } from './SceneRenderer'
import { groupNodeFixture, modelNodeFixture } from './scene-fixtures'
import { EMPTY_SCENE } from './sceneState'

function source(): Object3D {
  const root = new Object3D()
  root.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial()))
  return root
}

/**
 * A ⌘S on the model tab rewrites the file behind an id that does not move, so nothing inside
 * a comparison of two states can see it: `refreshModels` is the imperative door the shelf pushes.
 */
describe('once the catalogue says its file was rewritten', () => {
  const versions: Record<string, string> = {}

  function rendererVersioned(load: (url: string) => Promise<Object3D>, listening = {}) {
    return new SceneRenderer({
      onSelect: vi.fn(),
      onTransform: vi.fn(),
      loadModel: load,
      assetVersion: id => versions[id],
      ...listening,
    })
  }

  it('reads the new file, frees the old one, and leaves an unmoved model alone', async () => {
    versions['asset-a'] = 'a'
    versions['asset-b'] = 'a'
    const first = source()
    const mesh = first.children[0]
    const dispose = mesh instanceof Mesh ? vi.spyOn(mesh.geometry, 'dispose') : null
    const load = vi.fn(async (url: string) => (url.includes('?v=a') ? first : source()))
    const renderer = rendererVersioned(load)

    renderer.apply({
      ...EMPTY_SCENE,
      nodes: [modelNodeFixture('a', 'asset-a'), modelNodeFixture('b', 'asset-b')],
      selectedIds: [],
    })
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(2))

    renderer.refreshModels()
    expect(load).toHaveBeenCalledTimes(2)

    versions['asset-a'] = 'b'
    renderer.refreshModels()

    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(3))
    expect(load).toHaveBeenLastCalledWith('ia-studio://asset/asset-a?v=b')
    expect(dispose).toHaveBeenCalledTimes(1)
    renderer.dispose()
  })

  // What `useModelFiles` shows comes from these three ports: a reload that told nobody would
  // leave the inspector describing the file before the save.
  it('reports its materials, its rig and the stats again', async () => {
    versions['asset-a'] = 'a'
    const onMaterials = vi.fn()
    const onRig = vi.fn()
    const onStats = vi.fn()
    const renderer = rendererVersioned(async () => source(), { onMaterials, onRig, onStats })

    renderer.apply({ ...EMPTY_SCENE, nodes: [modelNodeFixture('a', 'asset-a')], selectedIds: [] })
    await vi.waitFor(() => expect(onRig).toHaveBeenCalledTimes(1))
    const statsBefore = onStats.mock.calls.length

    versions['asset-a'] = 'b'
    renderer.refreshModels()

    await vi.waitFor(() => expect(onRig).toHaveBeenCalledTimes(2))
    expect(onMaterials).toHaveBeenCalledTimes(2)
    expect(onStats.mock.calls.length).toBeGreaterThan(statsBefore)
    renderer.dispose()
  })

  // The gizmo is attached to an object, not an id: left alone, it would follow a holder no
  // longer in the scene until the next click.
  it('aims the gizmo again once the holder it held was replaced', async () => {
    versions['asset-a'] = 'a'
    const load = vi.fn(async () => source())
    const renderer = rendererVersioned(load)
    // Protected, and there is no gizmo without WebGL: the call is what can be observed here.
    const attachGizmo = vi.spyOn(renderer as unknown as { attachGizmo(): void }, 'attachGizmo')
    renderer.apply({
      ...EMPTY_SCENE,
      nodes: [modelNodeFixture('a', 'asset-a')],
      selectedIds: ['a'],
    })
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1))
    attachGizmo.mockClear()

    versions['asset-a'] = 'b'
    renderer.refreshModels()

    expect(attachGizmo).toHaveBeenCalledTimes(1)
    renderer.dispose()
  })

  // `release` takes the old holder out with everything hanging under it, and nothing calls the
  // second pass of `apply` here: a child left where it was would be drawn nowhere at all.
  it('hangs the model back under its parent, and its children back under it', async () => {
    versions['asset-a'] = 'a'
    const load = vi.fn(async () => source())
    const renderer = rendererVersioned(load)
    // The scene graph is what is asserted, and the engine publishes no reader for it.
    const { scene } = (renderer as unknown as { viewport: { scene: Object3D } }).viewport
    const model = { ...modelNodeFixture('a', 'asset-a'), parentId: 'group' }
    const child = { ...modelNodeFixture('child', 'asset-c'), parentId: 'a' }

    renderer.apply({
      ...EMPTY_SCENE,
      nodes: [groupNodeFixture('group'), model, child],
      selectedIds: [],
    })
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(2))

    versions['asset-a'] = 'b'
    renderer.refreshModels()

    expect(scene.getObjectByName('a')?.parent?.name).toBe('group')
    expect(scene.getObjectByName('child')?.parent?.name).toBe('a')
    renderer.dispose()
  })
})
