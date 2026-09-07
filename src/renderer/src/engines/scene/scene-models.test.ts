import { Mesh, BoxGeometry, MeshStandardMaterial, Object3D, Texture } from 'three'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { nodeIdOf, SceneRenderer, type SceneRendererOptions } from './SceneRenderer'
import { modelNodeFixture } from './scene-fixtures'
import type { SkinWeights } from '../character/skinWeights'
import type { SceneState } from './sceneState'
import type { Rig } from '@shared/domain/rig'
import { EMPTY_SCENE } from '@/engines/scene/sceneState'
import {
  detachModelFileTexturesInScenes,
  forgetSceneEngine,
  registerSceneEngine,
} from '@/stores/sceneEngines'

/**
 * The model path, driven through the loader port — the whole point of that port existing. jsdom
 * has no WebGL, so nothing is mounted: `apply` reflects a state without needing a canvas, which
 * is exactly what invariant 3 promises.
 */
function source(): Object3D {
  const root = new Object3D()
  root.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial()))
  return root
}

function withModels(...ids: string[]): SceneState {
  return {
    ...EMPTY_SCENE,
    nodes: ids.map(id => modelNodeFixture(id, `asset-${id}`)),
    selectedIds: [],
  }
}

function rendererLoading(load: (url: string) => Promise<Object3D>) {
  return new SceneRenderer({ onSelect: vi.fn(), onTransform: vi.fn(), loadModel: load })
}

/** The same, listening to which pictures the maps of a model ask for. */
function rendererDressing(asked: string[], wornDress?: SceneRendererOptions['wornDress']) {
  return new SceneRenderer({
    onSelect: vi.fn(),
    onTransform: vi.fn(),
    loadModel: async () => source(),
    loadTexture: url => {
      asked.push(url)
      return Promise.resolve(new Texture())
    },
    ...(wornDress ? { wornDress } : {}),
  })
}

describe('a model node', () => {
  it('detaches a replaced model from every mounted scene', () => {
    const first = rendererLoading(async () => source())
    const second = rendererLoading(async () => source())
    const firstDetach = vi.spyOn(first, 'detachModelFileTextures')
    const secondDetach = vi.spyOn(second, 'detachModelFileTextures')
    registerSceneEngine('scene-a', first)
    registerSceneEngine('scene-b', second)
    onTestFinished(() => {
      forgetSceneEngine('scene-a')
      forgetSceneEngine('scene-b')
      first.dispose()
      second.dispose()
    })

    detachModelFileTexturesInScenes('shared-model')

    expect(firstDetach).toHaveBeenCalledWith('shared-model')
    expect(secondDetach).toHaveBeenCalledWith('shared-model')
  })

  it('reads its file once, and puts what came back into the scene', async () => {
    const load = vi.fn(async () => source())
    const renderer = rendererLoading(load)

    renderer.apply(withModels('a'))
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1))

    renderer.dispose()
  })

  it('reads one file for two nodes pointing at the same asset', async () => {
    const load = vi.fn(async () => source())
    const renderer = rendererLoading(load)

    renderer.apply({
      ...EMPTY_SCENE,
      nodes: [modelNodeFixture('a', 'shared'), modelNodeFixture('b', 'shared')],
    })
    await vi.waitFor(() => expect(load).toHaveBeenCalled())

    expect(load).toHaveBeenCalledTimes(1)
    renderer.dispose()
  })

  /**
   * The reference belongs to `release` alone. When the callback let go as well, deleting one of
   * two nodes sharing an asset dropped the count to zero and freed a source the other was still
   * cloning — a model that vanished from the viewport for no reason the user could see.
   */
  it('keeps the shared source alive when one of two nodes goes', async () => {
    const parsed = source()
    const mesh = parsed.children[0]
    const dispose = mesh instanceof Mesh ? vi.spyOn(mesh.geometry, 'dispose') : null
    const load = vi.fn(async () => parsed)
    const renderer = rendererLoading(load)

    renderer.apply({
      ...EMPTY_SCENE,
      nodes: [modelNodeFixture('a', 'shared'), modelNodeFixture('b', 'shared')],
    })
    await vi.waitFor(() => expect(load).toHaveBeenCalled())

    renderer.apply({ ...EMPTY_SCENE, nodes: [modelNodeFixture('b', 'shared')], selectedIds: [] })
    expect(dispose).not.toHaveBeenCalled()

    renderer.apply({ ...EMPTY_SCENE, nodes: [], selectedIds: [] })
    expect(dispose).toHaveBeenCalled()

    renderer.dispose()
  })

  // A node deleted while its file is still being read must not leave a reference behind.
  it('lets go of a model whose node went before it arrived', async () => {
    let settle = (object: Object3D): void => void object
    const load = vi.fn(() => new Promise<Object3D>(resolve => (settle = resolve)))
    const renderer = rendererLoading(load)

    renderer.apply(withModels('a'))
    renderer.apply({ ...EMPTY_SCENE, nodes: [], selectedIds: [] })
    settle(source())

    // Asking again reads the file rather than handing back what nobody holds.
    renderer.apply(withModels('a'))
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(2))

    renderer.dispose()
  })

  /**
   * A model fills its holder long after the sync that built it, and the next sync skips a node
   * that has not changed — so flagging only in `syncNode` left an imported model throwing no
   * shadow at all until somebody edited it.
   */
  it('throws a shadow as soon as its file lands, without waiting to be edited', async () => {
    // The scene gets a clone, which a test cannot reach — so the source hands back a known one.
    const copy = source()
    const parsed = source()
    parsed.clone = () => copy

    const renderer = rendererLoading(async () => parsed)
    renderer.apply(withModels('a'))
    await vi.waitFor(() => expect(copy.parent).not.toBeNull())

    expect(copy.children[0]?.castShadow).toBe(true)
    expect(copy.children[0]?.receiveShadow).toBe(true)
    renderer.dispose()
  })

  /**
   * The dress lands where the shadow flags do, and for the same reason: what a file brings
   * arrives after the sync that built the holder, and the next sync skips an unchanged node.
   */
  it('wears the material it names as soon as its file lands', async () => {
    const asked: string[] = []
    const renderer = rendererDressing(asked, () => ({
      textures: { map: { assetId: 'tex-1' } },
      material: {},
    }))

    const node = modelNodeFixture('a', 'asset-a')
    node.model = { ...node.model, dress: { kind: 'materials', documentIds: ['mat-1'] } }
    renderer.apply({ ...EMPTY_SCENE, nodes: [node], selectedIds: [] })

    await vi.waitFor(() => expect(asked).toHaveLength(1))
    expect(asked[0]).toContain('tex-1')
    renderer.dispose()
  })

  it('asks for the pictures the material it is given later holds', async () => {
    const asked: string[] = []
    const renderer = rendererDressing(asked, () => ({
      textures: { normalMap: { assetId: 'tex-2' } },
      material: {},
    }))

    renderer.apply(withModels('a'))
    const dressed = modelNodeFixture('a', 'asset-a')
    dressed.model = { ...dressed.model, dress: { kind: 'materials', documentIds: ['mat-1'] } }
    renderer.apply({ ...EMPTY_SCENE, nodes: [dressed], selectedIds: [] })

    await vi.waitFor(() => expect(asked).toHaveLength(1))
    expect(asked[0]).toContain('tex-2')
    renderer.dispose()
  })

  /**
   * A model that names NO material wears what its own `.glb` carries, and asks the project for
   * nothing — the whole reason the reference is a gesture rather than a guess.
   */
  it('asks for no picture at all when it names no material', async () => {
    const asked: string[] = []
    const renderer = rendererDressing(asked, () => ({
      textures: { map: { assetId: 'tex-1' } },
      material: {},
    }))

    renderer.apply(withModels('a'))
    await new Promise(settle => setTimeout(settle, 0))

    expect(asked).toEqual([])
    renderer.dispose()
  })

  /** Twenty trees out of one file, one material: every one of them is dressed. */
  it('dresses every node naming the same material', async () => {
    const asked: string[] = []
    const renderer = rendererDressing(asked, () => ({
      textures: { map: { assetId: 'shared-map' } },
      material: {},
    }))

    const one = modelNodeFixture('a', 'asset-shared')
    const two = modelNodeFixture('b', 'asset-shared')
    one.model = { ...one.model, dress: { kind: 'materials', documentIds: ['mat-1'] } }
    two.model = { ...two.model, dress: { kind: 'materials', documentIds: ['mat-1'] } }
    renderer.apply({ ...EMPTY_SCENE, nodes: [one, two], selectedIds: [] })

    await vi.waitFor(() => expect(asked.length).toBeGreaterThan(0))
    expect(asked.every(url => url.includes('shared-map'))).toBe(true)
    renderer.dispose()
  })

  /**
   * The last link of « edit a picture of the material and the model follows »: ⌘S rewrites the
   * file behind an id that never moves, so nothing here would ever ask for it again on its own.
   */
  it('loads its picture again once the catalogue says it was rewritten', async () => {
    const asked: string[] = []
    let version = 'before'
    const renderer = new SceneRenderer({
      onSelect: vi.fn(),
      onTransform: vi.fn(),
      loadModel: async () => source(),
      loadTexture: url => {
        asked.push(url)
        return Promise.resolve(new Texture())
      },
      assetVersion: () => version,
      wornDress: () => ({ textures: { map: { assetId: 'tex-1' } }, material: {} }),
    })

    const node = modelNodeFixture('a', 'asset-a')
    node.model = { ...node.model, dress: { kind: 'materials', documentIds: ['mat-1'] } }
    renderer.apply({ ...EMPTY_SCENE, nodes: [node], selectedIds: [] })
    await vi.waitFor(() => expect(asked).toHaveLength(1))

    // The shelf was re-read and nothing moved: the slot must not decode the picture again.
    renderer.refreshTextures()
    expect(asked).toHaveLength(1)

    version = 'after'
    renderer.refreshTextures()

    await vi.waitFor(() => expect(asked).toHaveLength(2))
    expect(asked[1]).toContain('v=after')
    renderer.dispose()
  })

  it('leaves the rest of the scene standing when a file cannot be read', async () => {
    const load = vi.fn(async () => {
      throw new Error('gone')
    })
    const renderer = rendererLoading(load)

    renderer.apply(withModels('a'))
    await vi.waitFor(() => expect(load).toHaveBeenCalled())

    // The node is still there, holding its reference: a project whose assets moved still opens.
    expect(() => renderer.apply(withModels('a'))).not.toThrow()
    renderer.dispose()
  })
})

/**
 * `GLTFLoader` names every mesh it builds, so a name alone proves nothing: before this, a click
 * on an imported model reported `mesh_0`, and the selection became an id the scene had never
 * heard of — written into the document, and into the undo stack with it.
 */
describe('picking through what a file brought', () => {
  const holder = new Object3D()
  holder.name = 'node-1'

  const inner = new Mesh(new BoxGeometry(), new MeshStandardMaterial())
  inner.name = 'mesh_0'
  const named = new Object3D()
  named.name = 'Scene'
  named.add(inner)
  holder.add(named)

  const isNode = (name: string): boolean => name === 'node-1'

  it('answers the node, not the name the loader gave the mesh under the ray', () => {
    expect(nodeIdOf(inner, isNode)).toBe('node-1')
  })

  it('answers nothing for an object no node stands behind', () => {
    expect(nodeIdOf(named, () => false)).toBeNull()
  })

  it('still finds a light through its helper, which carries the node id', () => {
    const helper = new Object3D()
    helper.name = 'node-1'
    helper.add(new Object3D())

    expect(nodeIdOf(helper.children[0] ?? helper, isNode)).toBe('node-1')
  })
})

/**
 * The defect the shadow walk fixes, seen from where it happened. `shadows.test.ts` proves the
 * helper and its predicate; nothing proved the renderer handed one over — mutating
 * `ownedByAnotherNode(this.objects)` to `() => false` left the whole suite green.
 */
describe('a node hanging under another node', () => {
  // The port is handed a URL, not an id — `createModelCache` wraps every id in `assetUrl`.
  const holding = (parentCopy: Object3D, childCopy: Object3D) =>
    rendererLoading(async (url: string) =>
      Object.assign(source(), { clone: () => (url.includes('parent') ? parentCopy : childCopy) }),
    )

  const nodes = (parentCasts: boolean): SceneState => ({
    ...EMPTY_SCENE,
    nodes: [
      { ...modelNodeFixture('parent', 'asset-parent'), castShadow: parentCasts },
      { ...modelNodeFixture('child', 'asset-child'), parentId: 'parent', castShadow: false },
    ],
  })

  it('keeps its own shadow flags when its parent takes new ones', async () => {
    const parentCopy = source()
    const childCopy = source()
    const renderer = holding(parentCopy, childCopy)

    renderer.apply(nodes(false))
    await vi.waitFor(() => expect(childCopy.parent).not.toBeNull())
    // Both files are in the scene, so the walk below is the only thing left to write flags.
    renderer.apply(nodes(true))

    expect(parentCopy.children[0]?.castShadow).toBe(true)
    expect(childCopy.children[0]?.castShadow).toBe(false)
    renderer.dispose()
  })
})

const RIG: Rig = {
  origin: 'local',
  bones: [
    {
      name: 'Hips',
      parent: null,
      rest: {
        position: { x: 0, y: 1, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      role: 'Hips',
    },
  ],
}

/**
 * A skinning port that answers only when taken back, like the real one: a bind stays out until
 * its signal is abandoned, and then answers nothing.
 */
function pendingSkin() {
  const signals: (AbortSignal | undefined)[] = []

  return {
    signals,
    port: {
      bind: (_positions, _rig, watch) => {
        signals.push(watch?.signal)
        return new Promise(resolve => {
          watch?.signal?.addEventListener('abort', () => resolve(null))
          if (watch?.signal?.aborted) resolve(null)
        })
      },
      dispose: () => {},
    } satisfies SkinWeights,
  }
}

const holding = (id: string, assetId: string): SceneState => ({
  ...EMPTY_SCENE,
  nodes: [{ ...modelNodeFixture(id, assetId), model: { assetId } }],
})

// A scene no longer puts a skeleton on anything — the skeleton window does, through the very same
// door. What this holds is that a binding still stops when the model it was weighing goes away.
describe('binding a rig that is taken back', () => {
  it('stops the skinning of a model released while the weights were out', async () => {
    const skin = pendingSkin()
    const renderer = new SceneRenderer({
      onSelect: vi.fn(),
      onTransform: vi.fn(),
      loadModel: async () => source(),
      skin: skin.port,
    })

    renderer.apply(holding('a', 'asset-1'))
    // The model lands a tick after the apply that asked for it; only then is there a mesh to weigh.
    await vi.waitFor(async () => {
      void renderer.skinModel('a', RIG)
      expect(skin.signals).toHaveLength(1)
    })

    renderer.apply(EMPTY_SCENE)

    expect(skin.signals[0]?.aborted).toBe(true)
    renderer.dispose()
  })
})
