import { describe, expect, it } from 'vitest'
import {
  BatchedMesh,
  BoxGeometry,
  InstancedMesh,
  LOD,
  AnimationClip,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  NumberKeyframeTrack,
  Object3D,
  PerspectiveCamera,
} from 'three'
import { embeddedClip, type GeometryDescriptor } from '@shared/domain/scene'
import { SECOND } from '@shared/domain/time'
import { IDENTITY_TRANSFORM } from '@shared/domain/transform'
import type { AssetPort } from '@game/ports/assetPort'
import { csgPartOf, type CsgGraph } from '@shared/domain/csg'
import type { CompiledMeshGeometry } from '@shared/domain/gameExport'
import { carvedNode, groupNode, lightNode, meshNode, modelNode } from '@/engines/scene/nodeFactory'
import {
  DEFAULT_MATERIAL,
  EMPTY_SCENE,
  type SceneNode,
  type SceneState,
} from '@/engines/scene/sceneState'
import { colliderFromNode } from './colliderFromNode'
import { buildGameScene } from './gameScene'
import { WORTH_INSTANCING } from '@/engines/scene/grouping'
import type { RuntimeWorld } from '@/engines/scene/runtimeWorldCompiler'
import { compileLossyWorld as compilePlannedWorld } from '@/engines/scene/lossyWorldCompiler'
import { analyzeLossyWorld } from '@/engines/scene/worldAnalyzer'
import type { LossyOptimization } from '@shared/domain/gameExport'
import { NO_LOSSY_OPTIMIZATION } from '@shared/domain/gameExport'

const NOTHING: AssetPort = { urlOf: () => null }

function compileLossyWorld(state: SceneState, options: LossyOptimization) {
  return compilePlannedWorld(state, options, analyzeLossyWorld(state.nodes))
}
const BOX: GeometryDescriptor = { kind: 'box', width: 1, height: 1, depth: 1 }

const scene = (nodes: readonly SceneNode[]): SceneState => ({ ...EMPTY_SCENE, nodes: [...nodes] })

describe('a scene as a game draws it', () => {
  /** 🛑 No gizmo, no helper, no grid: what a game draws is the shapes and the lights. */
  it('makes an object for a shape and for a light, and none for a camera', async () => {
    const built = await buildGameScene(
      scene([
        meshNode(BOX, { name: 'Crate' }),
        lightNode({ kind: 'ambient', color: '#ffffff', intensity: 1 }, { x: 0, y: 1, z: 0 }),
      ]),
      NOTHING,
    )

    expect([...built.byEntity.values()].map(one => one.type)).toEqual(['Mesh', 'AmbientLight'])
  })

  /** A child declared before its group would otherwise land at the root, and stay there. */
  it('hangs a child under its group, whichever was declared first', async () => {
    const group = groupNode(undefined, 'Ground')
    const child = { ...meshNode(BOX), parentId: group.id }
    const built = await buildGameScene(scene([child, group]), NOTHING)

    expect(built.byEntity.get(child.id)?.parent).toBe(built.byEntity.get(group.id))
  })

  it('puts each object where its node stands', async () => {
    const node = {
      ...meshNode(BOX),
      transform: { ...IDENTITY_TRANSFORM, position: { x: 3, y: 2, z: -1 } },
    }
    const built = await buildGameScene(scene([node]), NOTHING)

    expect(built.byEntity.get(node.id)?.position.toArray()).toEqual([3, 2, -1])
  })

  it('draws repeated static shapes as spatial instances while keeping every logical entity', async () => {
    const nodes = Array.from({ length: WORTH_INSTANCING }, (_unused, index) =>
      meshNode(BOX, { name: `Crate ${index}` }),
    )

    const built = await buildGameScene(scene(nodes), NOTHING)
    const instances: InstancedMesh[] = []
    built.scene.traverse(object => {
      if (object instanceof InstancedMesh) instances.push(object)
    })

    expect(instances.reduce((count, instance) => count + instance.count, 0)).toBe(WORTH_INSTANCING)
    expect(instances.length).toBeLessThan(WORTH_INSTANCING)
    expect(nodes.every(node => built.byEntity.has(node.id))).toBe(true)
  })

  it('draws only the representations selected by the compiled runtime world', async () => {
    const nodes = Array.from({ length: WORTH_INSTANCING }, (_unused, index) =>
      meshNode(BOX, { name: `Individual crate ${index}` }),
    )
    const runtime: RuntimeWorld = {
      ...scene(nodes),
      runtimeOptimization: { artifacts: [] },
    }

    const built = await buildGameScene(runtime, NOTHING)
    const instances: InstancedMesh[] = []
    built.scene.traverse(object => {
      if (object instanceof InstancedMesh) instances.push(object)
    })

    expect(instances).toEqual([])
  })

  it('keeps a gameplay-driven repetition individual', async () => {
    const staticNodes = Array.from({ length: WORTH_INSTANCING }, (_unused, index) =>
      meshNode(BOX, { name: `Static crate ${index}` }),
    )
    const moving: SceneNode = {
      ...meshNode(BOX, { name: 'Moving crate' }),
      components: [{ type: 'Spin' }],
    }

    const built = await buildGameScene(scene([...staticNodes, moving]), NOTHING)
    const instances: InstancedMesh[] = []
    built.scene.traverse(object => {
      if (object instanceof InstancedMesh) instances.push(object)
    })

    expect(instances.reduce((count, instance) => count + instance.count, 0)).toBe(WORTH_INSTANCING)
    expect(built.byEntity.get(moving.id)?.parent).toBe(built.scene)
  })

  it('draws different compatible shapes through BatchedMesh when the author forces a batch', async () => {
    const nodes: SceneNode[] = [
      { ...meshNode(BOX), optimization: { mode: 'batch' } },
      {
        ...meshNode({ kind: 'box', width: 2, height: 1, depth: 1 }),
        optimization: { mode: 'batch' },
      },
    ]
    const built = await buildGameScene(scene(nodes), NOTHING)
    const batches: BatchedMesh[] = []
    built.scene.traverse(object => {
      if (object instanceof BatchedMesh) batches.push(object)
    })

    expect(batches).toHaveLength(1)
    expect(batches[0]?.instanceCount).toBe(2)
    expect(nodes.every(node => built.byEntity.has(node.id))).toBe(true)
    expect(
      built.scene.children.some(child => nodes.some(node => built.byEntity.get(node.id) === child)),
    ).toBe(false)
  })

  it('draws a baked authoring group as one InstancedMesh', async () => {
    const base = meshNode(BOX, { name: 'Baked crates' })
    if (base.type !== 'mesh') throw new Error('expected a mesh fixture')
    const node: SceneNode = {
      ...base,
      optimization: { mode: 'exclude' },
      instances: [
        { sourceId: 'first', name: 'First', transform: IDENTITY_TRANSFORM },
        {
          sourceId: 'second',
          name: 'Second',
          transform: { ...IDENTITY_TRANSFORM, position: { x: 3, y: 0, z: 0 } },
        },
      ],
    }
    const built = await buildGameScene(scene([node]), NOTHING)
    const rendered = built.byEntity.get(node.id)

    expect(rendered).toBeInstanceOf(InstancedMesh)
    expect(rendered instanceof InstancedMesh ? rendered.count : 0).toBe(2)
    expect(built.byEntity.get('first')).toBe(rendered)
    built.place('second', {
      ...IDENTITY_TRANSFORM,
      position: { x: 7, y: 1, z: -2 },
    })
    const matrix = new Matrix4()
    if (rendered instanceof InstancedMesh) rendered.getMatrixAt(1, matrix)
    expect(matrix.elements.slice(12, 15)).toEqual([7, 1, -2])
  })

  it('settles instanced bounds on the frame rather than on each placement', async () => {
    const base = meshNode(BOX, { name: 'Baked crates' })
    if (base.type !== 'mesh') throw new Error('expected a mesh fixture')
    const node: SceneNode = {
      ...base,
      optimization: { mode: 'exclude' },
      instances: [
        { sourceId: 'first', name: 'First', transform: IDENTITY_TRANSFORM },
        { sourceId: 'second', name: 'Second', transform: IDENTITY_TRANSFORM },
      ],
    }
    const built = await buildGameScene(scene([node]), NOTHING)
    const rendered = built.byEntity.get(node.id)
    if (!(rendered instanceof InstancedMesh)) throw new Error('expected an instanced draw')
    rendered.computeBoundingSphere()
    const before = rendered.boundingSphere?.radius ?? 0
    const uploaded = rendered.instanceMatrix.version

    built.place('second', { ...IDENTITY_TRANSFORM, position: { x: 100, y: 0, z: 0 } })
    expect(rendered.boundingSphere?.radius ?? 0).toBe(before)

    built.flush(new PerspectiveCamera())
    expect(rendered.boundingSphere?.radius ?? 0).toBeGreaterThan(before)
    expect(rendered.instanceMatrix.version).toBeGreaterThan(uploaded)
  })

  it('builds every generated LOD level as an instanced draw for a baked group', async () => {
    const base = meshNode(
      { kind: 'sphere', radius: 1, widthSegments: 24, heightSegments: 16 },
      { name: 'Baked trees' },
    )
    if (base.type !== 'mesh') throw new Error('expected a mesh fixture')
    const node: SceneNode = {
      ...base,
      instances: [
        { sourceId: 'first', name: 'First', transform: IDENTITY_TRANSFORM },
        { sourceId: 'second', name: 'Second', transform: IDENTITY_TRANSFORM },
      ],
    }
    const state = scene([node])
    const built = await buildGameScene(
      state,
      NOTHING,
      compileLossyWorld(state, { ...NO_LOSSY_OPTIMIZATION, generateLods: true }),
    )

    expect(built.byEntity.get(node.id)).toBeInstanceOf(LOD)
    expect(instancesIn(built.byEntity.get(node.id))).toHaveLength(3)
    expect(instancesIn(built.byEntity.get(node.id)).every(mesh => mesh.count === 2)).toBe(true)
  })

  it('loads and preserves existing LODs carried by a model asset', async () => {
    const source = new LOD()
    source.addLevel(new Mesh(), 0)
    source.addLevel(new Mesh(), 20)
    const node = {
      ...modelNode('model-1', 'Model'),
      transform: { ...IDENTITY_TRANSFORM, scale: { x: 4, y: 4, z: 4 } },
    }
    const built = await buildGameScene(
      scene([node]),
      { urlOf: () => 'assets/model.glb' },
      undefined,
      undefined,
      async () => source,
    )

    const rendered = built.byEntity.get(node.id)
    expect(rendered).toBeInstanceOf(LOD)
    expect(rendered instanceof LOD ? rendered.levels.map(level => level.distance) : []).toEqual([
      0, 20,
    ])
  })

  it('seeks embedded model animation from the exported scene clock', async () => {
    const source = new Object3D()
    source.animations = [
      new AnimationClip('walk', 1, [new NumberKeyframeTrack('.position[x]', [0, 1], [0, 6])]),
    ]
    const base = modelNode('model-1', 'Model')
    if (base.type !== 'model') throw new Error('expected a model')
    const node = {
      ...base,
      model: {
        ...base.model,
        lanes: [
          {
            id: 'main',
            clips: [embeddedClip('walk-block', 'walk', { duration: SECOND })],
          },
        ],
      },
    }
    const built = await buildGameScene(
      scene([node]),
      { urlOf: () => 'assets/model.glb' },
      undefined,
      undefined,
      async () => source,
    )

    built.seek(SECOND / 2)

    expect(built.byEntity.get(node.id)?.position.x).toBeCloseTo(3)
  })

  it('adds exported distant levels to a static mesh while preserving its exact model LOD0', async () => {
    const source = new Mesh(new BoxGeometry(), new MeshStandardMaterial())
    const node = modelNode('model-1', 'Model')
    const triangle: CompiledMeshGeometry = {
      encoding: 'float32-base64',
      position: 'AAAAAAAAAAAAAAAAAACAPwAAAAAAAAAAAAAAAAAAgD8AAAAA',
      normal: '',
      uv: '',
      index: 'AAAAAAEAAAACAAAA',
    }
    const built = await buildGameScene(
      scene([node]),
      { urlOf: () => 'assets/model.glb' },
      { nodes: [{ nodeId: node.id, modelAssetId: 'model-1' }] },
      { 'model-1': [{ meshIndex: 0, lodMeshes: [triangle] }] },
      async () => source,
    )
    const lods: LOD[] = []
    built.byEntity.get(node.id)?.traverse(object => {
      if (object instanceof LOD) lods.push(object)
    })

    expect(lods).toHaveLength(1)
    expect(lods[0]?.levels).toHaveLength(2)
    expect(lods[0]?.levels[0]?.object instanceof Mesh).toBe(true)
    expect(lods[0]?.levels[1]?.object instanceof Mesh).toBe(true)
  })

  /** A game has no picture for a texture the project has lost, and draws the shape all the same. */
  it('draws a shape whose texture nothing resolves, with no map on it', async () => {
    const node = meshNode(BOX)
    const lost: SceneNode =
      node.type === 'mesh'
        ? { ...node, material: { ...node.material, map: { assetId: 'x' } } }
        : node
    const built = await buildGameScene(scene([lost]), NOTHING)
    const mesh = built.byEntity.get(node.id)

    expect(mesh).toBeInstanceOf(Mesh)
    expect(mesh instanceof Mesh && (mesh.material as MeshStandardMaterial).map).toBeNull()
  })

  /** 🛑 What a game FEELS, it DRAWS: a kind left out of the graph is a wall the player is
   * blocked by and cannot see. */
  it('draws a carved solid, which the physics already feels', async () => {
    const node = carvedNode(pierced())
    const built = await buildGameScene(scene([node]), NOTHING)
    const object = built.byEntity.get(node.id)

    if (!(object instanceof Mesh)) throw new Error('expected a mesh')

    expect(colliderFromNode(node)).not.toBeNull()
    expect(object.geometry.getAttribute('position').count).toBeGreaterThan(0)
  })

  it('uploads an exported CSG buffer without evaluating its authoring recipe again', async () => {
    const node = carvedNode(pierced())
    const built = await buildGameScene(scene([node]), NOTHING, {
      nodes: [
        {
          nodeId: node.id,
          mesh: {
            encoding: 'float32-base64',
            position: 'AAAAAAAAAAAAAAAAAACAPwAAAAAAAAAAAAAAAAAAgD8AAAAA',
            normal: '',
            uv: '',
            index: 'AAAAAAEAAAACAAAA',
          },
        },
      ],
    })
    const object = built.byEntity.get(node.id)

    if (!(object instanceof Mesh)) throw new Error('expected a mesh')
    expect(object.geometry.getAttribute('position').count).toBe(3)
    expect(object.geometry.getIndex()?.count).toBe(3)
  })

  it('paints the background a scene asked for', async () => {
    const built = await buildGameScene(
      {
        ...EMPTY_SCENE,
        world: { ...EMPTY_SCENE.world, background: { kind: 'color', color: '#102030' } },
      },
      NOTHING,
    )

    expect(built.scene.background).not.toBeNull()
  })

  it('keeps the original geometry as LOD0 and simplifies only the distant levels', async () => {
    const node = meshNode({ kind: 'sphere', radius: 1, widthSegments: 24, heightSegments: 16 })
    const state = scene([node])
    const built = await buildGameScene(
      state,
      NOTHING,
      compileLossyWorld(state, { ...NO_LOSSY_OPTIMIZATION, generateLods: true }),
    )
    const object = built.byEntity.get(node.id)

    expect(object).toBeInstanceOf(LOD)
    if (!(object instanceof LOD)) throw new Error('expected generated LOD')
    expect(object.levels).toHaveLength(3)
    expect(object.levels[0]?.object instanceof Mesh && object.levels[0].object.geometry.type).toBe(
      'SphereGeometry',
    )
    const counts = object.levels.map(level =>
      level.object instanceof Mesh ? level.object.geometry.getAttribute('position').count : 0,
    )
    expect(counts[0]).toBeGreaterThan(counts[1] ?? 0)
    expect(counts[1]).toBeGreaterThan(counts[2] ?? 0)
  })

  it('scales generated LOD distances with the logical object size', async () => {
    const node = {
      ...meshNode({ kind: 'sphere', radius: 1, widthSegments: 24, heightSegments: 16 }),
      transform: { ...IDENTITY_TRANSFORM, scale: { x: 4, y: 2, z: 1 } },
    }
    const state = scene([node])
    const built = await buildGameScene(
      state,
      NOTHING,
      compileLossyWorld(state, { ...NO_LOSSY_OPTIMIZATION, generateLods: true }),
    )
    const object = built.byEntity.get(node.id)

    if (!(object instanceof LOD)) throw new Error('expected generated LOD')
    expect(object.levels[1]?.distance).toBeCloseTo(48)
    expect(object.levels[2]?.distance).toBeCloseTo(144)
    built.place(node.id, { ...IDENTITY_TRANSFORM, scale: { x: 2, y: 2, z: 2 } })
    expect(object.levels[1]?.distance).toBeCloseTo(24)
    expect(object.levels[2]?.distance).toBeCloseTo(72)
  })

  it('simplifies one mesh only when a LOSSY geometry level is named', async () => {
    const node = meshNode({ kind: 'sphere', radius: 1, widthSegments: 24, heightSegments: 16 })
    const original = await buildGameScene(scene([node]), NOTHING)
    const state = scene([node])
    const reduced = await buildGameScene(
      state,
      NOTHING,
      compileLossyWorld(state, {
        ...NO_LOSSY_OPTIMIZATION,
        geometrySimplification: 'aggressive',
      }),
    )
    const before = original.byEntity.get(node.id)
    const after = reduced.byEntity.get(node.id)

    expect(before instanceof Mesh && after instanceof Mesh).toBe(true)
    if (!(before instanceof Mesh) || !(after instanceof Mesh)) return
    expect(after.geometry.getAttribute('position').count).toBeLessThan(
      before.geometry.getAttribute('position').count,
    )
  })
})

/** A wall with a window taken out of it — the shape a game is asked to draw and to be stopped by. */
function pierced(): CsgGraph {
  return {
    base: csgPartOf('Wall', { kind: 'box', width: 4, height: 3, depth: 0.2 }, DEFAULT_MATERIAL),
    steps: [
      {
        operation: 'subtract',
        part: csgPartOf('Window', { kind: 'box', width: 1, height: 1, depth: 1 }, DEFAULT_MATERIAL),
      },
    ],
    collision: 'hull',
  }
}

function instancesIn(object: Object3D | undefined): readonly InstancedMesh[] {
  const instances: InstancedMesh[] = []
  object?.traverse(child => {
    if (child instanceof InstancedMesh) instances.push(child)
  })
  return instances
}
