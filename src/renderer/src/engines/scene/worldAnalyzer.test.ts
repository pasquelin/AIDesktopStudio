import {
  BoxGeometry,
  BufferGeometry,
  DataTexture,
  InterleavedBuffer,
  InterleavedBufferAttribute,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  SkinnedMesh,
  Texture,
} from 'three'
import { describe, expect, it, vi } from 'vitest'
import { EMPTY_TIMELINE, type AnimationTimeline } from '@shared/domain/animation'
import { DRAWN_BY_INSTANCE, WORTH_INSTANCING } from './grouping'
import { groupNodeFixture, meshNode, modelNodeFixture } from './scene-fixtures'
import { markInstanceable } from './instanceableModel'
import type { SceneNode } from './sceneState'
import type { OptimizationSettings } from '@shared/domain/scene'
import { analyzeOptimization, analyzeOptimizationAsync, optimizationReport } from './worldAnalyzer'

function repeated(count: number): {
  nodes: ReturnType<typeof meshNode>[]
  objects: Map<string, Mesh>
} {
  const geometry = new BoxGeometry()
  const material = new MeshStandardMaterial()
  const nodes = Array.from({ length: count }, (_unused, index) => meshNode(`node-${index}`))
  return {
    nodes,
    objects: new Map(nodes.map(node => [node.id, new Mesh(geometry, material)])),
  }
}

describe('analyzeOptimization', () => {
  it('yields between bounded chunks while analyzing a whole world', async () => {
    const node = modelNodeFixture('large-model')
    const model = new Object3D()
    const material = new MeshStandardMaterial()
    for (let index = 0; index < 201; index += 1) {
      model.add(new Mesh(new BoxGeometry(index + 1, 1, 1), material))
    }
    markInstanceable(model, true)
    const pause = vi.fn(async () => {})

    const plan = await analyzeOptimizationAsync(
      { nodes: [node], animation: EMPTY_TIMELINE },
      new Object3D(),
      () => model,
      { minInstancesPerGroup: WORTH_INSTANCING, analysisChunkSize: 100 },
      [node],
      pause,
    )

    expect(pause).toHaveBeenCalledTimes(6)
    expect(plan.measured).toMatchObject({ objects: 1, meshes: 201 })
  })
  it('lands a non-mesh node in the cell the adaptive partition made for the same place', () => {
    const at = (node: SceneNode): SceneNode => ({
      ...node,
      transform: { ...node.transform, position: { x: 100, y: 0, z: 0 } },
    })
    const nodes = [at(meshNode('mesh')), at(groupNodeFixture('group'))]

    const plan = analyzeOptimization(
      { nodes, animation: EMPTY_TIMELINE },
      new Object3D(),
      () => undefined,
    )

    expect(plan.spatialCells).toHaveLength(1)
    expect(plan.spatialCells[0]?.sourceIds).toEqual(['group', 'mesh'])
  })

  it('reports repeated static meshes without changing their render state', () => {
    const { nodes, objects } = repeated(WORTH_INSTANCING)
    const visibility = [...objects.values()].map(mesh => mesh.visible)

    const plan = analyzeOptimization({ nodes, animation: EMPTY_TIMELINE }, new Object3D(), id =>
      objects.get(id),
    )

    expect(plan.instances).toHaveLength(1)
    expect(plan.sharedGeometry[0]?.sourceIds).toHaveLength(WORTH_INSTANCING)
    expect(plan.sharedMaterials[0]?.sourceIds).toHaveLength(WORTH_INSTANCING)
    expect(plan.spatialCells[0]?.sourceIds).toHaveLength(WORTH_INSTANCING)
    expect(plan.merges).toEqual([])
    expect(plan.classifications[0]?.classifications).toEqual([
      'STATIC',
      'INSTANCABLE',
      'BATCHABLE',
      'MERGEABLE',
    ])
    expect(plan.measured.visibleObjects).toBe(WORTH_INSTANCING)
    expect(plan.instances[0]?.sourceIds).toHaveLength(WORTH_INSTANCING)
    const geometry = objects.values().next().value?.geometry
    if (!geometry) throw new Error('fixture has no geometry')
    const geometryBytes = Object.values(geometry.attributes).reduce(
      (bytes, attribute) => bytes + attribute.array.byteLength,
      geometry.index?.array.byteLength ?? 0,
    )
    expect(plan.estimated).toEqual({
      drawCallsBefore: WORTH_INSTANCING,
      drawCallsAfter: 1,
      avoidedGeometryBytes: geometryBytes * (WORTH_INSTANCING - 1),
      avoidedTextureBytes: 0,
    })
    expect([...objects.values()].map(mesh => mesh.visible)).toEqual(visibility)
    expect(optimizationReport(plan)).toMatchObject({
      instanceCandidates: WORTH_INSTANCING,
      visualChanges: 'NONE',
    })
  })

  /**
   * 🛑 `sweep` parks a source it has already instanced on `DRAWN_BY_INSTANCE` and leaves it
   * VISIBLE. Counted as a draw call, the analysis re-proposed a group the engine had made.
   */
  it('still reports the authoring sources after the runtime has instanced them', () => {
    const { nodes, objects } = repeated(WORTH_INSTANCING)
    for (const mesh of objects.values()) mesh.layers.set(DRAWN_BY_INSTANCE)

    const plan = analyzeOptimization({ nodes, animation: EMPTY_TIMELINE }, new Object3D(), id =>
      objects.get(id),
    )

    expect(plan.instances).toHaveLength(1)
    expect(plan.measured.meshes).toBe(WORTH_INSTANCING)
    expect(plan.estimated.drawCallsBefore).toBe(WORTH_INSTANCING)
  })

  it('does not promise groups below a scripted parent the runtime must preserve', () => {
    const { nodes, objects } = repeated(WORTH_INSTANCING)
    const parent: SceneNode = {
      ...groupNodeFixture('parent'),
      components: [{ type: 'Script' }],
    }
    const children: SceneNode[] = nodes.map(node => ({ ...node, parentId: parent.id }))

    const plan = analyzeOptimization(
      { nodes: [parent, ...children], animation: EMPTY_TIMELINE },
      new Object3D(),
      id => objects.get(id),
    )

    expect(plan.instances).toEqual([])
    expect(plan.estimated.drawCallsAfter).toBe(plan.estimated.drawCallsBefore)
  })

  it('keeps a selected child excluded when its scripted parent is outside the report target', () => {
    const { nodes, objects } = repeated(WORTH_INSTANCING)
    const parent: SceneNode = {
      ...groupNodeFixture('parent'),
      components: [{ type: 'Script' }],
    }
    const children: SceneNode[] = nodes.map(node => ({ ...node, parentId: parent.id }))

    const plan = analyzeOptimization(
      { nodes: children, animation: EMPTY_TIMELINE },
      new Object3D(),
      id => objects.get(id),
      undefined,
      [parent, ...children],
    )

    expect(plan.instances).toEqual([])
  })

  it('returns the same ordered plan for the same world', () => {
    const { nodes, objects } = repeated(WORTH_INSTANCING)
    const analyze = () =>
      analyzeOptimization({ nodes, animation: EMPTY_TIMELINE }, new Object3D(), id =>
        objects.get(id),
      )

    expect(analyze()).toEqual(analyze())
  })

  it('respects individual and excluded overrides when reporting runtime candidates', () => {
    const first: SceneNode = { ...meshNode('first'), optimization: { mode: 'exclude' } }
    const second: SceneNode = {
      ...meshNode('second'),
      geometry: { kind: 'box', width: 2, height: 1, depth: 1 },
      optimization: { mode: 'individual' },
    }
    const material = new MeshStandardMaterial()
    const objects = new Map<string, Mesh>([
      [first.id, new Mesh(new BoxGeometry(), material)],
      [second.id, new Mesh(new BoxGeometry(2, 1, 1), material)],
    ])

    const plan = analyzeOptimization(
      { nodes: [first, second], animation: EMPTY_TIMELINE },
      new Object3D(),
      id => objects.get(id),
    )

    expect(plan.instances).toEqual([])
    expect(plan.batches).toEqual([])
    expect(plan.merges).toEqual([])
  })

  it('classifies moving, animated, and skinned objects as unsafe candidates', () => {
    const moving: SceneNode = { ...meshNode('moving'), components: [{ type: 'Movement' }] }
    const animated = meshNode('animated')
    const skinned = meshNode('skinned')
    const objects = new Map<string, Object3D>([
      [moving.id, new Mesh(new BoxGeometry(), new MeshStandardMaterial())],
      [animated.id, new Mesh(new BoxGeometry(), new MeshStandardMaterial())],
      [skinned.id, new SkinnedMesh(new BoxGeometry(), new MeshStandardMaterial())],
    ])
    const animation: AnimationTimeline = {
      ...EMPTY_TIMELINE,
      tracks: [
        {
          id: 'track',
          name: 'Move',
          index: 0,
          muted: false,
          solo: false,
          locked: false,
          target: { nodeId: animated.id, property: 'position' },
          keys: [],
        },
      ],
    }

    const plan = analyzeOptimization(
      { nodes: [moving, animated, skinned], animation },
      new Object3D(),
      id => objects.get(id),
      { minInstancesPerGroup: 1, analysisChunkSize: 100 },
    )

    expect(plan.instances).toEqual([])
    expect(plan.warnings).toEqual([
      { nodeId: 'moving', reason: 'dynamic' },
      { nodeId: 'animated', reason: 'animated' },
      { nodeId: 'skinned', reason: 'skinned' },
    ])
  })

  it('measures shared geometry once while counting every visible mesh', () => {
    const { nodes, objects } = repeated(2)
    const geometry = objects.get(nodes[0]?.id ?? '')?.geometry
    if (!geometry) throw new Error('fixture has no geometry')

    const plan = analyzeOptimization({ nodes, animation: EMPTY_TIMELINE }, new Object3D(), id =>
      objects.get(id),
    )

    const expectedBytes = Object.values(geometry.attributes).reduce(
      (bytes, attribute) => bytes + attribute.array.byteLength,
      geometry.index?.array.byteLength ?? 0,
    )
    expect(plan.measured).toMatchObject({
      objects: 2,
      meshes: 2,
      geometryBytes: expectedBytes,
      sharedMaterials: 1,
    })
    expect(plan.instances).toEqual([])
    expect(plan.bakeCandidates).toHaveLength(1)
    expect(plan.estimated.avoidedGeometryBytes).toBe(expectedBytes)
  })

  it('detects equal geometry buffers and materials held by distinct Three resources', () => {
    const first = meshNode('first')
    const second = meshNode('second')
    const firstGeometry = new BoxGeometry()
    const secondGeometry = new BoxGeometry()
    const objects = new Map<string, Mesh>([
      [first.id, new Mesh(firstGeometry, new MeshStandardMaterial({ roughness: 0.35 }))],
      [second.id, new Mesh(secondGeometry, new MeshStandardMaterial({ roughness: 0.35 }))],
    ])

    const plan = analyzeOptimization(
      { nodes: [first, second], animation: EMPTY_TIMELINE },
      new Object3D(),
      id => objects.get(id),
    )

    expect(secondGeometry).not.toBe(firstGeometry)
    expect(plan.sharedGeometry[0]?.key.endsWith(':0')).toBe(true)
    expect(plan.sharedGeometry[0]?.sourceIds).toEqual(['first', 'second'])
    expect(plan.sharedMaterials[0]?.sourceIds).toEqual(['first', 'second'])
    expect(plan.estimated.avoidedGeometryBytes).toBeGreaterThan(0)
    expect(plan.measured.sharedMaterials).toBe(1)
  })

  it('does not classify buffers with one different value as shared content', () => {
    const first = meshNode('first')
    const second = meshNode('second')
    const firstGeometry = new BoxGeometry()
    const secondGeometry = new BoxGeometry()
    const position = secondGeometry.getAttribute('position')
    position.setX(0, position.getX(0) + 0.25)
    const objects = new Map<string, Mesh>([
      [first.id, new Mesh(firstGeometry, new MeshStandardMaterial())],
      [second.id, new Mesh(secondGeometry, new MeshStandardMaterial())],
    ])

    const plan = analyzeOptimization(
      { nodes: [first, second], animation: EMPTY_TIMELINE },
      new Object3D(),
      id => objects.get(id),
    )

    expect(plan.sharedGeometry).toEqual([])
  })

  it('only reports identity sharing above the synchronous content budget', () => {
    const shared = new BoxGeometry()
    const nodes = [meshNode('first'), meshNode('second'), meshNode('third')]
    const objects = new Map<string, Mesh>([
      ['first', new Mesh(shared, new MeshStandardMaterial())],
      ['second', new Mesh(shared, new MeshStandardMaterial())],
      ['third', new Mesh(new BoxGeometry(), new MeshStandardMaterial())],
    ])

    const plan = analyzeOptimization(
      { nodes, animation: EMPTY_TIMELINE },
      new Object3D(),
      id => objects.get(id),
      { minInstancesPerGroup: 16, analysisChunkSize: 100, maxSynchronousContentBytes: 1 },
    )

    expect(plan.sharedGeometry).toHaveLength(1)
    expect(plan.sharedGeometry[0]?.sourceIds).toEqual(['first', 'second'])
  })

  it('counts an interleaved geometry buffer once when estimating avoided memory', () => {
    const geometry = new BufferGeometry()
    const interleaved = new InterleavedBuffer(new Float32Array(18), 6)
    geometry.setAttribute('position', new InterleavedBufferAttribute(interleaved, 3, 0))
    geometry.setAttribute('normal', new InterleavedBufferAttribute(interleaved, 3, 3))
    const material = new MeshStandardMaterial()
    const first = meshNode('first')
    const second = meshNode('second')
    const objects = new Map<string, Mesh>([
      [first.id, new Mesh(geometry, material)],
      [second.id, new Mesh(geometry, material)],
    ])

    const plan = analyzeOptimization(
      { nodes: [first, second], animation: EMPTY_TIMELINE },
      new Object3D(),
      id => objects.get(id),
    )

    expect(plan.estimated.avoidedGeometryBytes).toBe(interleaved.array.byteLength)
  })

  it('includes automatic merging when estimating the potential submissions', () => {
    const material = new MeshStandardMaterial()
    const nodes = ['small', 'medium', 'large'].map(id => meshNode(id))
    const objects = new Map<string, Mesh>(
      nodes.map((node, index) => [node.id, new Mesh(new BoxGeometry(index + 1, 1, 1), material)]),
    )

    const plan = analyzeOptimization({ nodes, animation: EMPTY_TIMELINE }, new Object3D(), id =>
      objects.get(id),
    )

    expect(plan.instances).toEqual([])
    expect(plan.batches).toEqual([])
    expect(plan.merges).toHaveLength(1)
    expect(plan.estimated).toMatchObject({ drawCallsBefore: 3, drawCallsAfter: 1 })
  })

  it('counts the batching saving once someone has actually asked for it', () => {
    const material = new MeshStandardMaterial()
    const batched: OptimizationSettings = { mode: 'batch' }
    const nodes = ['small', 'medium', 'large'].map(id => ({
      ...meshNode(id),
      optimization: batched,
    }))
    const objects = new Map<string, Mesh>(
      nodes.map((node, index) => [node.id, new Mesh(new BoxGeometry(index + 1, 1, 1), material)]),
    )

    const plan = analyzeOptimization({ nodes, animation: EMPTY_TIMELINE }, new Object3D(), id =>
      objects.get(id),
    )

    expect(plan.estimated).toMatchObject({ drawCallsBefore: 3, drawCallsAfter: 1 })
  })

  it('does not promise automatic model batching before runtime compatibility is known', () => {
    const node = modelNodeFixture('building')
    const model = new Object3D()
    const material = new MeshStandardMaterial()
    model.add(
      new Mesh(new BoxGeometry(1, 1, 1), material),
      new Mesh(new BoxGeometry(2, 1, 1), material),
      new Mesh(new BoxGeometry(3, 1, 1), material),
    )
    markInstanceable(model, true)

    const plan = analyzeOptimization(
      { nodes: [node], animation: EMPTY_TIMELINE },
      new Object3D(),
      () => model,
    )

    expect(plan.instances).toEqual([])
    expect(plan.batches).toEqual([])
    expect(plan.estimated).toMatchObject({ drawCallsBefore: 3, drawCallsAfter: 3 })
  })

  it('measures memory already avoided by shared textures', () => {
    const texture = new Texture({ width: 16, height: 8 })
    const firstMaterial = new MeshStandardMaterial({ map: texture })
    const secondMaterial = new MeshStandardMaterial({ map: texture })
    const first = meshNode('first')
    const second = meshNode('second')
    const objects = new Map<string, Mesh>([
      [first.id, new Mesh(new BoxGeometry(), firstMaterial)],
      [second.id, new Mesh(new BoxGeometry(), secondMaterial)],
    ])

    const plan = analyzeOptimization(
      { nodes: [first, second], animation: EMPTY_TIMELINE },
      new Object3D(),
      id => objects.get(id),
    )

    expect(plan.estimated.avoidedTextureBytes).toBe(16 * 8 * 4)
    expect(plan.measured.sharedMaterials).toBe(1)
  })

  it('detects identical readable pixels across distinct textures and materials', () => {
    const firstTexture = new DataTexture(new Uint8Array([10, 20, 30, 255]), 1, 1)
    const secondTexture = new DataTexture(new Uint8Array([10, 20, 30, 255]), 1, 1)
    const first = meshNode('first')
    const second = meshNode('second')
    const objects = new Map<string, Mesh>([
      [first.id, new Mesh(new BoxGeometry(), new MeshStandardMaterial({ map: firstTexture }))],
      [second.id, new Mesh(new BoxGeometry(), new MeshStandardMaterial({ map: secondTexture }))],
    ])

    const plan = analyzeOptimization(
      { nodes: [first, second], animation: EMPTY_TIMELINE },
      new Object3D(),
      id => objects.get(id),
    )

    expect(secondTexture).not.toBe(firstTexture)
    expect(plan.estimated.avoidedTextureBytes).toBe(4)
    expect(plan.sharedMaterials[0]?.sourceIds).toEqual(['first', 'second'])
  })

  it('counts a parented mesh once and leaves hidden branches out of measured render costs', () => {
    const host = new Object3D()
    const group = new Object3D()
    const mesh = new Mesh(new BoxGeometry(), new MeshStandardMaterial())
    const groupNode = groupNodeFixture('group')
    const childNode = meshNode('child', groupNode.id)
    group.visible = false
    group.add(mesh)
    host.add(group)
    const objects = new Map<string, Object3D>([
      [groupNode.id, group],
      [childNode.id, mesh],
    ])

    const plan = analyzeOptimization(
      { nodes: [groupNode, childNode], animation: EMPTY_TIMELINE },
      host,
      id => objects.get(id),
    )

    expect(plan.measured).toMatchObject({
      objects: 2,
      visibleObjects: 0,
      meshes: 0,
      draws: 0,
      geometryBytes: 0,
    })
    expect(plan.classifications[0]).toEqual({ id: 'group', classifications: ['STATIC'] })
  })

  it('keeps a hidden skinned mesh unsafe', () => {
    const node = meshNode('skinned')
    const mesh = new SkinnedMesh(new BoxGeometry(), new MeshStandardMaterial())
    mesh.visible = false

    const plan = analyzeOptimization(
      { nodes: [node], animation: EMPTY_TIMELINE },
      new Object3D(),
      () => mesh,
      { minInstancesPerGroup: 1, analysisChunkSize: 100 },
    )

    expect(plan.classifications[0]?.classifications).toEqual(['SKINNED', 'UNSAFE'])
    expect(plan.instances).toEqual([])
  })
})
