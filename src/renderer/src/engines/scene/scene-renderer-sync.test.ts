import { BufferGeometry, Group, Material, Mesh, Object3D } from 'three'
import { beforeEach, describe, expect, it, vi, type Mock, type MockInstance } from 'vitest'
import { nodeIdOf, SceneRenderer } from './SceneRenderer'
import type { ModelSource } from './modelCache'
import {
  directionalLight,
  lightNodeFixture,
  meshNode,
  modelNodeFixture,
  spriteNodeFixture,
} from './scene-fixtures'
import { EMPTY_SCENE, type SceneNode, type SceneState } from './sceneState'
import { type LightDescriptor } from '@shared/domain/scene'

/**
 * What an edit does to a scene already built — and, above all, what it frees. The renderer is
 * never mounted: everything below happens while the objects are assembled, which is the half a
 * test can reach and where every leak this file guards against would happen.
 *
 * Freeing is watched on the three.js prototypes rather than on the scene graph, which the engine
 * keeps to itself. It is also the honest place to watch it: what matters is that a buffer is
 * given back, not which object held it.
 *
 * What is out of reach here: whether an object leaves the three.js graph. `exportTo` reads the
 * engine's own map of nodes, not the scene, so a node removed from the map but left hanging in
 * the graph looks identical from outside. Only a mounted renderer would tell them apart.
 */

let freedGeometries: MockInstance<() => void>
let freedMaterials: MockInstance<() => void>
let loadModel: Mock<ModelSource>

beforeEach(() => {
  vi.restoreAllMocks()
  freedGeometries = vi.spyOn(BufferGeometry.prototype, 'dispose')
  freedMaterials = vi.spyOn(Material.prototype, 'dispose')
  loadModel = vi.fn<ModelSource>(async () => new Group())
})

const rendererOf = (...nodes: SceneNode[]): SceneRenderer => {
  const renderer = new SceneRenderer({
    onSelect: () => {},
    onTransform: () => {},
    loadModel,
  })
  renderer.apply({ ...EMPTY_SCENE, nodes })
  return renderer
}

const applied = (renderer: SceneRenderer, ...nodes: SceneNode[]): void => {
  const state: SceneState = { ...EMPTY_SCENE, nodes }
  renderer.apply(state)
}

const fileOf = async (renderer: SceneRenderer): Promise<string> => {
  const bytes = await renderer.exportTo('gltf', 'scene')
  return new TextDecoder().decode(bytes)
}

const namesIn = async (renderer: SceneRenderer): Promise<string[]> => {
  // `as`: a `.gltf` file holds glTF, and `nodes` is the field a reader looks at first.
  const file = JSON.parse(await fileOf(renderer)) as { nodes?: { name?: string }[] }
  return (file.nodes ?? []).flatMap(node => node.name ?? [])
}

describe('a node that goes away', () => {
  it('is dropped from what the document exports', async () => {
    const renderer = rendererOf(meshNode('box-1'), meshNode('box-2'))

    applied(renderer, meshNode('box-2'))

    expect(await namesIn(renderer)).toEqual(['box-2'])
  })

  it('gives back the buffer and the material of a mesh', () => {
    const renderer = rendererOf(meshNode('box-1'))
    freedGeometries.mockClear()
    freedMaterials.mockClear()

    applied(renderer)

    expect(freedGeometries).toHaveBeenCalled()
    expect(freedMaterials).toHaveBeenCalled()
  })

  /**
   * three.js shares one quad between every sprite ever built. Freeing it with the first sprite
   * removed would leave every other one drawing from a buffer that is gone.
   */
  it('gives back the material of a sprite but never its geometry', () => {
    const renderer = rendererOf(spriteNodeFixture('sprite-1'))
    freedGeometries.mockClear()
    freedMaterials.mockClear()

    applied(renderer)

    expect(freedMaterials).toHaveBeenCalled()
    expect(freedGeometries).not.toHaveBeenCalled()
  })

  /** A forgotten helper leaks a line geometry on every delete. */
  it('gives back the line buffer of a light helper', () => {
    const renderer = rendererOf(directionalLight('light-1'))
    freedGeometries.mockClear()

    applied(renderer)

    expect(freedGeometries).toHaveBeenCalled()
  })

  /**
   * An ambient lamp has no helper at all, so its body is the ONLY thing it draws: whatever is
   * freed here was freed for the marker and for nothing else.
   */
  it('gives back the body of a deleted lamp', () => {
    const renderer = rendererOf(lightNodeFixture('light-1'))
    freedGeometries.mockClear()
    freedMaterials.mockClear()

    applied(renderer)

    expect(freedGeometries).toHaveBeenCalled()
    expect(freedMaterials).toHaveBeenCalled()
  })

  /**
   * A slider emits a value per frame, and rebuilding a spot on each one costs 0,56 ms of the
   * 16,6 a frame has. What the body reads is written into it; only a change of kind is a
   * different body.
   */
  it('rebuilds nothing when a lamp is edited without changing kind', () => {
    const renderer = rendererOf(directionalLight('light-1'))
    freedGeometries.mockClear()

    applied(
      renderer,
      lightNodeFixture('light-1', {
        kind: 'directional',
        color: '#ff0000',
        intensity: 0.5,
        target: { x: 1, y: 2, z: 3 },
      }),
    )

    expect(freedGeometries).not.toHaveBeenCalled()
  })

  /**
   * The reference is keyed by what the node pointed at, and `applied` is the only thing that
   * remembers it — read after the map is emptied, the cache would keep the file alive forever.
   */
  it('gives its model back to the cache', async () => {
    const renderer = rendererOf(modelNodeFixture('model-1', 'asset-1'))
    await vi.waitFor(() => expect(loadModel).toHaveBeenCalledTimes(1))

    applied(renderer)
    applied(renderer, modelNodeFixture('model-2', 'asset-1'))

    // Loaded again rather than served from the cache: the first reference was given back.
    await vi.waitFor(() => expect(loadModel).toHaveBeenCalledTimes(2))
  })
})

describe('a model pointed somewhere else', () => {
  it('is fetched again rather than kept', async () => {
    const renderer = rendererOf(modelNodeFixture('model-1', 'asset-1'))
    await vi.waitFor(() => expect(loadModel).toHaveBeenCalledTimes(1))

    applied(renderer, modelNodeFixture('model-1', 'asset-2'))

    await vi.waitFor(() => expect(loadModel).toHaveBeenCalledTimes(2))
    expect(loadModel).toHaveBeenLastCalledWith(expect.stringContaining('asset-2'))
  })

  it('is left alone when it still points at the same file', async () => {
    const renderer = rendererOf(modelNodeFixture('model-1', 'asset-1'))
    await vi.waitFor(() => expect(loadModel).toHaveBeenCalledTimes(1))

    applied(renderer, { ...modelNodeFixture('model-1', 'asset-1'), name: 'renamed' })

    expect(loadModel).toHaveBeenCalledTimes(1)
  })
})

describe('an edit to what a node is made of', () => {
  it('replaces the shape when the geometry changes', async () => {
    const box = meshNode('box-1')
    const renderer = rendererOf(box)
    const before = await fileOf(renderer)

    applied(renderer, {
      ...box,
      geometry: { kind: 'sphere', radius: 1, widthSegments: 16, heightSegments: 12 },
    })

    expect(await fileOf(renderer)).not.toEqual(before)
  })

  it('carries the colour through to the file', async () => {
    const box = meshNode('box-1')
    const renderer = rendererOf(box)

    applied(renderer, { ...box, material: { ...box.material, color: '#ff0000' } })

    // The value, not the field: glTF omits `baseColorFactor` altogether while the material is
    // still white and opaque, so asserting its presence alone would go green on any colour.
    expect(await fileOf(renderer)).toContain('"baseColorFactor":[1,0,0,1]')
  })
})

describe('a child whose parent arrives later', () => {
  /**
   * Nodes arrive in document order, and nothing promises a parent comes first. What the export
   * shows is the hanging itself: a child whose parent is going out too travels *inside* it, so
   * it only appears at all if it was actually hung there.
   */
  it('joins its parent on the sync that builds it', async () => {
    const child = meshNode('child-1', 'parent-1')
    const renderer = rendererOf(child)

    expect(await namesIn(renderer)).toEqual(['child-1'])

    applied(renderer, child, meshNode('parent-1'))

    expect((await namesIn(renderer)).sort()).toEqual(['child-1', 'parent-1'])
  })
})

describe('finding which node was clicked', () => {
  const known = (name: string): boolean => name === 'box-1'

  it('answers with the node itself', () => {
    const object = new Object3D()
    object.name = 'box-1'

    expect(nodeIdOf(object, known)).toBe('box-1')
  })

  /**
   * A ray meets a helper's child, or one of the hundred meshes a GLB brought — and
   * `GLTFLoader` names every one of them, so a name alone proves nothing.
   */
  it('walks up from a child the loader named', () => {
    const node = new Object3D()
    node.name = 'box-1'
    const fromTheFile = new Mesh()
    fromTheFile.name = 'Cube.001'
    node.add(fromTheFile)

    expect(nodeIdOf(fromTheFile, known)).toBe('box-1')
  })

  it('answers nothing for an object the scene never heard of', () => {
    const stray = new Object3D()
    stray.name = 'Cube.001'

    expect(nodeIdOf(stray, known)).toBeNull()
  })
})

/**
 * Which of the three refresh intents an edit reaches for. A shadow map is drawn from a light, so
 * an edit that moved no silhouette can reuse the maps of the frame before — measured at 4.9 ms
 * against 2.2 for four point lights, which cast six faces each.
 */
describe('what an edit asks the viewport for', () => {
  const watched = (renderer: SceneRenderer) => ({
    every: vi.spyOn(renderer['viewport'], 'requestRender'),
    changed: vi.spyOn(renderer['viewport'], 'requestShadowRender'),
    none: vi.spyOn(renderer['viewport'], 'requestCameraRender'),
  })

  it('reuses shadow maps when only the selection changes', () => {
    const nodes = [meshNode('box-1')]
    const renderer = rendererOf(...nodes)
    const asked = watched(renderer)

    renderer.apply({ ...EMPTY_SCENE, nodes, selectedIds: ['box-1'] })

    expect(asked.every).not.toHaveBeenCalled()
    expect(asked.none).toHaveBeenCalled()
  })

  it('reuses shadow maps when only a mesh surface changes', () => {
    const original = meshNode('box-1')
    const renderer = rendererOf(original)
    const asked = watched(renderer)

    applied(renderer, {
      ...original,
      material: { ...original.material, color: '#ff0000', roughness: 0.2, metalness: 0.8 },
    })

    expect(asked.every).not.toHaveBeenCalled()
    expect(asked.changed).not.toHaveBeenCalled()
    expect(asked.none).toHaveBeenCalledOnce()
  })

  it('refreshes shadow maps when displacement changes a mesh silhouette', () => {
    const original = meshNode('box-1')
    const renderer = rendererOf(original)
    const asked = watched(renderer)

    applied(renderer, {
      ...original,
      material: { ...original.material, displacementMap: { assetId: 'height-1' } },
    })

    expect(asked.every).toHaveBeenCalledOnce()
  })

  it('reuses shadow maps when a light changes only colour and intensity', () => {
    const target = { x: 0, y: 0, z: 0 }
    const lit: LightDescriptor = { kind: 'directional', color: '#ffffff', intensity: 1, target }
    const renderer = rendererOf(lightNodeFixture('light-1', lit))
    const asked = watched(renderer)

    applied(renderer, lightNodeFixture('light-1', { ...lit, color: '#ff0000', intensity: 0.5 }))

    expect(asked.changed).not.toHaveBeenCalled()
    expect(asked.none).toHaveBeenCalled()
  })

  it('requests a shadow pass when a light projection changes', () => {
    const renderer = rendererOf(directionalLight('light-1'))
    const asked = watched(renderer)

    applied(
      renderer,
      lightNodeFixture('light-1', {
        kind: 'directional',
        color: '#ffffff',
        intensity: 1,
        target: { x: 2, y: 0, z: 0 },
      }),
    )

    expect(asked.changed).toHaveBeenCalled()
  })

  it('redraws every shadow map when a light carrying another one moves', () => {
    const under = {
      ...lightNodeFixture('light-2', {
        kind: 'directional',
        color: '#ffffff',
        intensity: 1,
        target: { x: 0, y: 0, z: 0 },
      }),
      parentId: 'light-1',
    }
    const renderer = rendererOf(directionalLight('light-1'), under)
    const asked = watched(renderer)

    applied(
      renderer,
      lightNodeFixture('light-1', {
        kind: 'directional',
        color: '#ffffff',
        intensity: 1,
        target: { x: 2, y: 0, z: 0 },
      }),
      under,
    )

    // What hangs UNDER a lamp has its own shadow moved by it, and nothing in the state says so.
    expect(asked.changed).not.toHaveBeenCalled()
    expect(asked.every).toHaveBeenCalled()
  })

  it('reuses shadow maps while the Before/After gesture is held', () => {
    const renderer = rendererOf(meshNode('box-1'))
    const asked = watched(renderer)

    renderer.setPostBypassed(true)

    // A composition held off changes the pixels, never a silhouette — and this is a press-and-hold.
    expect(asked.every).not.toHaveBeenCalled()
    expect(asked.none).toHaveBeenCalledOnce()
  })

  it('arms the GPU timer only for whoever reads the runtime profile', () => {
    const renderer = rendererOf(meshNode('box-1'))
    const wants = vi.spyOn(renderer['viewport'], 'wantsGpuTiming')

    applied(renderer, meshNode('box-2'))
    expect(wants).not.toHaveBeenCalled()

    renderer.runtimePerformance()
    expect(wants).toHaveBeenCalled()
  })
})
