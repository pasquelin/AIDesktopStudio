import { Bone, BoxGeometry, Mesh, MeshStandardMaterial, Object3D, SkinnedMesh } from 'three'
import { MeshBVH } from 'three-mesh-bvh'
import { describe, expect, it, vi } from 'vitest'
import { IDENTITY_TRANSFORM } from '@shared/domain/transform'
import type { Rig, RigBone } from '@shared/domain/rig'
import { SceneRenderer } from './SceneRenderer'
import type * as ModelCache from './modelCache'
import type { SkinWeights } from '../character/skinWeights'
import { modelNodeFixture } from './scene-fixtures'
import { EMPTY_SCENE, type SceneState } from './sceneState'

/** The stage mounts a clone; handing the source back is what makes its bones reachable here. */
vi.mock('./modelCache', async importOriginal => ({
  ...(await importOriginal<typeof ModelCache>()),
  instanceOf: (source: Object3D) => source,
}))

/** A bare model: one box, no bones — what a character arrives as before anything rigs it. */
function source(): Object3D {
  const root = new Object3D()
  root.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial()))
  return root
}

const bone = (name: string, parent: string | null): RigBone => ({
  name,
  parent,
  rest: { ...IDENTITY_TRANSFORM, position: { x: 0, y: 1, z: 0 } },
})

const HIPS: Rig = { origin: 'local', bones: [bone('Hips', null)] }
/** The same skeleton with a finger on it — the shape « add hands » gives a rig. */
const WITH_FINGER: Rig = {
  origin: 'local',
  bones: [bone('Hips', null), bone('LeftThumb1', 'Hips')],
}
const WITH_TOE: Rig = {
  origin: 'local',
  bones: [bone('Hips', null), bone('LeftToe', 'Hips')],
}

/** Weights that land at once, all vertices on the first joint. Nothing here tests the maths. */
const skin: SkinWeights = {
  bind: positions => {
    const vertices = positions.length / 3
    return Promise.resolve({
      skinIndex: new Uint16Array(vertices * 4),
      skinWeight: new Float32Array(vertices * 4).map((_, at) => (at % 4 === 0 ? 1 : 0)),
    })
  },
  dispose: () => {},
}

const holding = (id: string): SceneState => ({ ...EMPTY_SCENE, nodes: [modelNodeFixture(id)] })

/** The picking trees, built here rather than in the worker jsdom cannot spawn. */
function trees() {
  return {
    accelerate: (mesh: Mesh) => {
      mesh.geometry.boundsTree = new MeshBVH(mesh.geometry)
      return Promise.resolve()
    },
    dispose: () => {},
  }
}

/** The whole tree the model hangs in: the bones go on its HOLDER, which the stage owns. */
function stageOf(model: Object3D): Object3D {
  let top = model
  while (top.parent) top = top.parent
  return top
}

const boneNamesOf = (model: Object3D): string[] => {
  const names: string[] = []
  stageOf(model).traverse(object => {
    if (object instanceof Bone) names.push(object.name)
  })
  return names.sort()
}

const skinnedIn = (model: Object3D): SkinnedMesh[] => {
  const skinned: SkinnedMesh[] = []
  stageOf(model).traverse(object => {
    if (object instanceof SkinnedMesh) skinned.push(object)
  })
  return skinned
}

async function rigged(): Promise<{ engine: SceneRenderer; model: Object3D }> {
  const model = source()
  const engine = new SceneRenderer({
    onSelect: vi.fn(),
    onTransform: vi.fn(),
    loadModel: () => Promise.resolve(model),
    skin,
    bvh: trees(),
  })

  engine.apply(holding('a'))
  await vi.waitFor(() => expect(model.parent).not.toBeNull())
  await engine.skinModel('a', HIPS)
  await vi.waitFor(() => expect(boneNamesOf(model)).toEqual(['Hips']))

  return { engine, model }
}

describe('a rig laid on a model that already wears one', () => {
  it('lets only the latest of three overlapping skinning requests change the model', async () => {
    const model = source()
    const settlers: Array<() => void> = []
    const deferredSkin: SkinWeights = {
      bind: (positions, _rig, watch) =>
        new Promise(resolve => {
          settlers.push(() => {
            if (watch?.signal?.aborted) return resolve(null)
            const vertices = positions.length / 3
            resolve({
              skinIndex: new Uint16Array(vertices * 4),
              skinWeight: new Float32Array(vertices * 4).map((_, at) => (at % 4 === 0 ? 1 : 0)),
            })
          })
        }),
      dispose: () => {},
    }
    const engine = new SceneRenderer({
      onSelect: vi.fn(),
      onTransform: vi.fn(),
      loadModel: () => Promise.resolve(model),
      skin: deferredSkin,
      bvh: trees(),
    })
    engine.apply(holding('a'))
    await vi.waitFor(() => expect(model.parent).not.toBeNull())

    const first = engine.skinModel('a', HIPS)
    const second = engine.skinModel('a', WITH_FINGER)
    settlers[0]?.()
    await first
    const third = engine.skinModel('a', WITH_TOE)
    settlers[2]?.()
    await third
    settlers[1]?.()
    await second

    expect(boneNamesOf(model)).toEqual(['Hips', 'LeftToe'])
    engine.dispose()
  })

  it('keeps runtime placement while a model loads and is rigged, then restores its authored pose', async () => {
    const model = source()
    let settle = (object: Object3D): void => void object
    const loading = new Promise<Object3D>(resolve => (settle = resolve))
    const engine = new SceneRenderer({
      onSelect: vi.fn(),
      onTransform: vi.fn(),
      loadModel: () => loading,
      skin,
      bvh: trees(),
    })
    const state = holding('a')
    const moved = { ...IDENTITY_TRANSFORM, position: { x: 0, y: 3, z: 0 } }
    try {
      engine.apply(state)
      expect(engine.applyRuntimeTransforms([{ id: 'a', transform: moved }])).toBe(true)
      settle(model)
      await vi.waitFor(() => expect(model.parent).not.toBeNull())
      await engine.skinModel('a', HIPS)
      expect(boneNamesOf(model)).toEqual(['Hips'])
      stageOf(model).updateMatrixWorld(true)
      expect(model.matrixWorld.elements[13]).toBe(3)
      expect(state.nodes[0]?.transform.position.y).toBe(0)
      engine.apply(state)
      stageOf(model).updateMatrixWorld(true)
      expect(model.matrixWorld.elements[13]).toBe(0)
      expect(boneNamesOf(model)).toEqual(['Hips'])
    } finally {
      engine.dispose()
    }
  })

  /**
   * 🛑 « Add hands » took the store from 22 bones to 52 and the model kept its 22: the meshes were
   * already skinned, and the mesh gathering refused them — so this returned in silence.
   */
  it('weighs the model against the bones the rig now holds', async () => {
    const { engine, model } = await rigged()

    await engine.skinModel('a', WITH_FINGER)

    expect(boneNamesOf(model)).toEqual(['Hips', 'LeftThumb1'])
    engine.dispose()
  })

  // Left on, the old skeleton would stand beside the new one: the model would count both, and
  // every rest edit after it would be measured against bones nothing drives.
  it('takes the skeleton it replaces off the model', async () => {
    const { engine, model } = await rigged()
    const bonesOf = (root: Object3D): Bone[] => {
      const found: Bone[] = []
      root.traverse(object => {
        if (object instanceof Bone) found.push(object)
      })
      return found
    }
    const first = bonesOf(stageOf(model))

    await engine.skinModel('a', WITH_FINGER)

    // The one it replaced hangs from nothing now, and exactly the new rig is left on the model.
    expect(first).toHaveLength(1)
    expect(first[0]?.parent).toBeNull()
    expect(boneNamesOf(model)).toEqual(['Hips', 'LeftThumb1'])
    engine.dispose()
  })

  // 🛑 `applyRig` CLONES each geometry, and a clone carries no `boundsTree`: rigging threw away
  // the tree built when the model landed, and every ray then walked the triangles again.
  it('leaves the mesh it just skinned carrying a picking tree', async () => {
    const { engine, model } = await rigged()

    expect(skinnedIn(model).map(one => one.geometry.boundsTree !== undefined)).toEqual([true])
    engine.dispose()
  })

  // The mesh has to follow the new bones, not merely stand next to them.
  it('binds the mesh to the skeleton it just laid', async () => {
    const { engine, model } = await rigged()

    await engine.skinModel('a', WITH_FINGER)

    const skinned = skinnedIn(model)

    expect(skinned).toHaveLength(1)
    expect(skinned[0]?.skeleton.bones.map(one => one.name)).toEqual(['Hips', 'LeftThumb1'])
    engine.dispose()
  })
})
