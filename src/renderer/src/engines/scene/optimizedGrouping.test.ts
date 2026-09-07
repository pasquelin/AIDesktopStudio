import {
  BatchedMesh,
  BoxGeometry,
  Group,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Raycaster,
  Vector3,
} from 'three'
import { describe, expect, it, vi } from 'vitest'
import { meshNode, modelNodeFixture } from './scene-fixtures'
import {
  createOptimizedGroups,
  editorPickingTargets,
  RUNTIME_PICKING_THRESHOLD,
  type EditorPickingGroup,
} from './optimizedGrouping'
import { WORTH_INSTANCING, type RuntimeRenderArtifact } from './grouping'
import { markInstanceable } from './instanceableModel'
import type { SceneNode } from './sceneState'

function repeated(count: number): { nodes: SceneNode[]; objects: Map<string, Object3D> } {
  const geometry = new BoxGeometry(1, 1, 1)
  const material = new MeshStandardMaterial()
  const nodes = Array.from({ length: count }, (_, index) => meshNode(`pick-${index}`))
  const objects = new Map(
    nodes.map((node, index) => {
      const mesh = new Mesh(geometry, material)
      mesh.name = node.id
      mesh.position.set(index * 2, 0, 0)
      mesh.updateMatrixWorld(true)
      return [node.id, mesh]
    }),
  )
  return { nodes, objects }
}

function addNestedModels(host: Object3D, nodes: SceneNode[], objects: Map<string, Object3D>): void {
  const geometry = new BoxGeometry()
  const material = new MeshStandardMaterial()
  for (let index = 0; index < WORTH_INSTANCING; index += 1) {
    const node = modelNodeFixture(`nested-${index}`)
    const holder = new Group()
    const nested = new Group()
    holder.name = node.id
    holder.position.set(index * 3, 0, 300)
    nested.add(new Mesh(geometry, material))
    holder.add(nested)
    markInstanceable(holder, true)
    host.add(holder)
    nodes.push(node)
    objects.set(node.id, holder)
  }
}

function addDiverseMeshes(
  prefix: string,
  count: number,
  z: number,
  nodes: SceneNode[],
  objects: Map<string, Object3D>,
): string[] {
  const ids = Array.from({ length: count }, (_, index) => `${prefix}-${index}`)
  const material = new MeshStandardMaterial()
  for (const [index, id] of ids.entries()) {
    const node: SceneNode = {
      ...meshNode(id),
      geometry: { kind: 'box', width: index + 2, height: 1, depth: 1 },
    }
    const mesh = new Mesh(new BoxGeometry(index + 2, 1, 1), material)
    mesh.name = id
    mesh.position.set(index * 20, 0, z)
    mesh.updateMatrixWorld(true)
    nodes.push(node)
    objects.set(id, mesh)
  }
  return ids
}

describe('optimized editor picking targets', () => {
  const pickingGroup = (count: number) => {
    const source = new Mesh()
    const runtime = new Mesh()
    const editorPickable = vi.fn(() => Array.from({ length: count }, () => source))
    const pickable = vi.fn(() => [runtime])
    const group: EditorPickingGroup = { editorPickable, editorSourceCount: () => count, pickable }
    return { group, editorPickable, pickable, source, runtime }
  }

  it('materializes sources only below the measured threshold', () => {
    const below = pickingGroup(RUNTIME_PICKING_THRESHOLD - 1)
    expect(editorPickingTargets([below.group])).toHaveLength(RUNTIME_PICKING_THRESHOLD - 1)
    expect(below.editorPickable).toHaveBeenCalledOnce()
    expect(below.pickable).not.toHaveBeenCalled()

    const threshold = pickingGroup(RUNTIME_PICKING_THRESHOLD)
    expect(editorPickingTargets([threshold.group])).toEqual([threshold.runtime])
    expect(threshold.editorPickable).not.toHaveBeenCalled()
    expect(threshold.pickable).toHaveBeenCalledOnce()
  })

  it('keeps individual sources below the measured runtime threshold', () => {
    const groups = createOptimizedGroups(new Object3D())
    const { nodes, objects } = repeated(WORTH_INSTANCING)
    groups.rebuild(nodes, id => objects.get(id))

    expect(groups.editorPickable()).toEqual([...objects.values()])
  })

  it('uses the grouped runtime representation without losing identity at the measured threshold', () => {
    const groups = createOptimizedGroups(new Object3D())
    const { nodes, objects } = repeated(RUNTIME_PICKING_THRESHOLD)
    groups.rebuild(nodes, id => objects.get(id))

    const targets = groups.editorPickable()
    expect(targets.length).toBeLessThan(RUNTIME_PICKING_THRESHOLD)
    const selected = objects.get(`pick-${Math.floor(RUNTIME_PICKING_THRESHOLD / 2)}`)
    if (!selected) throw new Error('source fixture missing')
    const hit = new Raycaster(
      new Vector3(selected.position.x, 10, selected.position.z),
      new Vector3(0, -1, 0),
    ).intersectObjects([...targets], false)[0]

    expect(hit && groups.nodeIdOf(hit)).toBe(selected.name)
  })

  it('keeps mixed runtime identities and a moved nested model across rebuilds', () => {
    const host = new Object3D()
    const groups = createOptimizedGroups(host)
    const { nodes, objects } = repeated(RUNTIME_PICKING_THRESHOLD - 9 - WORTH_INSTANCING)
    addNestedModels(host, nodes, objects)
    const batchIds = addDiverseMeshes('batch', 9, 100, nodes, objects)
    const mergeIds = addDiverseMeshes('merge', 2, 200, nodes, objects)
    host.updateMatrixWorld(true)
    const instanceIds = nodes.slice(0, RUNTIME_PICKING_THRESHOLD - 9).map(node => node.id)
    const artifacts: readonly RuntimeRenderArtifact[] = [
      { key: 'instances', strategy: 'instance', sourceIds: instanceIds, signature: 'instances' },
      { key: 'batches', strategy: 'batch', sourceIds: batchIds, signature: 'batches' },
      { key: 'merges', strategy: 'merge', sourceIds: mergeIds, signature: 'merges' },
    ]
    const rebuild = () => groups.rebuild(nodes, id => objects.get(id), undefined, artifacts)
    const pickedAt = (x: number, z: number) => {
      const raycaster = new Raycaster(new Vector3(x, 10, z), new Vector3(0, -1, 0))
      raycaster.layers.enableAll()
      const hit = raycaster.intersectObjects([...groups.editorPickable()], false)[0]
      return hit ? groups.nodeIdOf(hit) : null
    }

    rebuild()
    expect(pickedAt(0, 100)).toBe('batch-0')
    expect(pickedAt(0, 200)).toBe('merge-0')
    const nestedNode = modelNodeFixture('nested-5')
    const nestedHolder = objects.get(nestedNode.id)
    if (!nestedHolder) throw new Error('nested model fixture missing')
    nestedHolder.position.set(100, 0, 300)
    nestedHolder.updateWorldMatrix(true, false)
    groups.moved([nestedNode.id], id => objects.get(id))
    expect(pickedAt(100, 300)).toBe(nestedNode.id)
    expect(pickedAt(15, 300)).toBeNull()

    groups.rebuild([], () => undefined)
    expect(groups.editorPickable()).toEqual([])
    expect(groups.editorSourceCount()).toBe(0)
    rebuild()
    expect(groups.editorSourceCount()).toBe(RUNTIME_PICKING_THRESHOLD)
    expect(pickedAt(100, 300)).toBe(nestedNode.id)
  })
})

it('draws automatic repetitions as instances and forced batches as BatchedMesh together', () => {
  const host = new Object3D()
  const material = new MeshStandardMaterial()
  const geometry = new BoxGeometry()
  const nodes: SceneNode[] = []
  const objects = new Map<string, Mesh>()

  for (let at = 0; at < 16; at += 1) {
    const node = meshNode(`instance-${at}`)
    nodes.push(node)
    objects.set(node.id, new Mesh(geometry, material))
  }
  for (let at = 0; at < 2; at += 1) {
    const node: SceneNode = {
      ...meshNode(`batch-${at}`),
      geometry: { kind: 'box', width: at + 2, height: 1, depth: 1 },
      optimization: { mode: 'batch' },
    }
    nodes.push(node)
    objects.set(node.id, new Mesh(new BoxGeometry(at + 2, 1, 1), material))
  }
  for (const object of objects.values()) object.updateMatrixWorld(true)

  const groups = createOptimizedGroups(host)
  expect(groups.rebuild(nodes, id => objects.get(id))).toBe(18)
  expect(groups.drawn().filter(mesh => mesh instanceof InstancedMesh)).not.toHaveLength(0)
  expect(groups.drawn().filter(mesh => mesh instanceof BatchedMesh)).toHaveLength(1)
})

it('keeps gameplay exclusions individual even when batch is forced', () => {
  const host = new Object3D()
  const node: SceneNode = { ...meshNode('door'), optimization: { mode: 'batch' } }
  const mesh = new Mesh(new BoxGeometry(), new MeshStandardMaterial())
  mesh.updateMatrixWorld(true)

  const groups = createOptimizedGroups(host)
  expect(groups.rebuild([node], () => mesh, new Set([node.id]))).toBe(0)
  expect(groups.drawn()).toHaveLength(0)
})

it('keeps individual and excluded overrides out of every optimized representation', () => {
  const host = new Object3D()
  const material = new MeshStandardMaterial()
  const nodes: SceneNode[] = [
    { ...meshNode('individual'), optimization: { mode: 'individual' } },
    { ...meshNode('excluded'), optimization: { mode: 'exclude' } },
  ]
  const objects = new Map(nodes.map(node => [node.id, new Mesh(new BoxGeometry(), material)]))
  for (const object of objects.values()) object.updateMatrixWorld(true)

  const groups = createOptimizedGroups(host)
  expect(groups.rebuild(nodes, id => objects.get(id))).toBe(0)
  expect(groups.drawn()).toHaveLength(0)
})

it('restores a grouped source when its override changes to individual', () => {
  const host = new Object3D()
  const material = new MeshStandardMaterial()
  const geometry = new BoxGeometry()
  const automatic = Array.from({ length: 16 }, (_unused, at) => meshNode(`node-${at}`))
  const objects = new Map(automatic.map(node => [node.id, new Mesh(geometry, material)]))
  for (const mesh of objects.values()) {
    host.add(mesh)
    mesh.updateMatrixWorld(true)
  }
  const groups = createOptimizedGroups(host)
  groups.rebuild(automatic, id => objects.get(id))
  const sources = new Set<Object3D>(objects.values())
  expect(host.children.every(child => !sources.has(child))).toBe(true)

  const individual: SceneNode[] = automatic.map(node => ({
    ...node,
    optimization: { mode: 'individual' },
  }))
  expect(groups.rebuild(individual, id => objects.get(id))).toBe(0)
  expect(groups.drawn()).toHaveLength(0)
  expect(host.children).toEqual([...objects.values()])
  expect([...objects.values()].every(mesh => mesh.layers.isEnabled(0))).toBe(true)
})

it('builds only the representations selected by compiled runtime artifacts', () => {
  const host = new Object3D()
  const material = new MeshStandardMaterial()
  const firstGeometry = new BoxGeometry()
  const secondGeometry = new BoxGeometry(2, 1, 1)
  const nodes = Array.from({ length: 32 }, (_unused, index) => meshNode(`node-${index}`))
  const objects = new Map(
    nodes.map((node, index) => [
      node.id,
      new Mesh(index < 16 ? firstGeometry : secondGeometry, material),
    ]),
  )
  for (const object of objects.values()) object.updateMatrixWorld(true)
  const artifacts: readonly RuntimeRenderArtifact[] = [
    {
      key: 'trees',
      strategy: 'instance',
      sourceIds: nodes.slice(0, 16).map(node => node.id),
      signature: 'compiled-trees',
    },
  ]

  const groups = createOptimizedGroups(host)

  expect(groups.rebuild(nodes, id => objects.get(id), undefined, artifacts)).toBe(16)
  expect(groups.drawn()).toHaveLength(1)
  expect(groups.drawn()[0]?.geometry).toBe(firstGeometry)
})

it('builds compiled merge and sub-instancing-threshold batch artifacts', () => {
  const host = new Object3D()
  const material = new MeshStandardMaterial()
  const nodes: SceneNode[] = Array.from({ length: 11 }, (_unused, index) => ({
    ...meshNode(`node-${index}`),
    geometry: { kind: 'box', width: index + 1, height: 1, depth: 1 },
  }))
  const objects = new Map(
    nodes.map((node, index) => [node.id, new Mesh(new BoxGeometry(index + 1, 1, 1), material)]),
  )
  for (const object of objects.values()) object.updateMatrixWorld(true)
  const artifacts: readonly RuntimeRenderArtifact[] = [
    {
      key: 'small-props',
      strategy: 'merge',
      sourceIds: nodes.slice(0, 2).map(node => node.id),
      signature: 'small-props',
    },
    {
      key: 'large-props',
      strategy: 'batch',
      sourceIds: nodes.slice(2).map(node => node.id),
      signature: 'large-props',
    },
  ]

  const groups = createOptimizedGroups(host)

  expect(groups.rebuild(nodes, id => objects.get(id), undefined, artifacts)).toBe(11)
  expect(
    groups.drawn().filter(mesh => mesh instanceof Mesh && !(mesh instanceof BatchedMesh)),
  ).toHaveLength(1)
  expect(groups.drawn().filter(mesh => mesh instanceof BatchedMesh)).toHaveLength(1)
})

it('rebuilds a merged group when a member moves beside a batched one', () => {
  const host = new Object3D()
  const material = new MeshStandardMaterial()
  const nodes: SceneNode[] = Array.from({ length: 11 }, (_unused, index) => ({
    ...meshNode(`node-${index}`),
    geometry: { kind: 'box', width: index + 1, height: 1, depth: 1 },
  }))
  const objects = new Map(
    nodes.map((node, index) => [node.id, new Mesh(new BoxGeometry(index + 1, 1, 1), material)]),
  )
  for (const object of objects.values()) {
    host.add(object)
    object.updateMatrixWorld(true)
  }
  const artifacts: readonly RuntimeRenderArtifact[] = [
    {
      key: 'small-props',
      strategy: 'merge',
      sourceIds: nodes.slice(0, 2).map(node => node.id),
      signature: 'small-props',
    },
    {
      key: 'large-props',
      strategy: 'batch',
      sourceIds: nodes.slice(2).map(node => node.id),
      signature: 'large-props',
    },
  ]
  const merged = (groups: ReturnType<typeof createOptimizedGroups>): Object3D | undefined =>
    groups.drawn().find(mesh => !(mesh instanceof BatchedMesh) && !(mesh instanceof InstancedMesh))

  const groups = createOptimizedGroups(host)
  groups.rebuild(nodes, id => objects.get(id), undefined, artifacts)
  const before = merged(groups)
  objects.get('node-0')?.position.set(50, 0, 0)
  objects.get('node-0')?.updateWorldMatrix(true, false)

  expect(groups.moved(['node-0', 'node-2'], id => objects.get(id))).toBe(true)
  expect(merged(groups)).not.toBe(before)
})
