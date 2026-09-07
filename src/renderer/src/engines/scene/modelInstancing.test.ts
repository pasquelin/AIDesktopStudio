import { BoxGeometry, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Object3D } from 'three'
import { describe, expect, it } from 'vitest'
import { createCellGroups } from './cellInstancing'
import { DRAWN_BY_INSTANCE, WORTH_INSTANCING } from './grouping'
import { markInstanceable } from './instanceableModel'
import { createInstancedGroups } from './instancing'
import { nodeIdOf } from './SceneRenderer'
import { applyShadowFlags } from './shadows'
import { meshNode, modelNodeFixture } from './scene-fixtures'
import { statsOf } from './sceneStats'
import type { SceneNode } from './sceneState'

function copies(
  count: number,
  primitives: number,
  assetId = 'tree',
): { nodes: SceneNode[]; objects: Map<string, Object3D>; host: Object3D } {
  const nodes: SceneNode[] = []
  const objects = new Map<string, Object3D>()
  const host = new Object3D()
  const shapes = [new BoxGeometry(1, 1, 1), new BoxGeometry(0.4, 2, 0.4)]
  const paints = [new MeshStandardMaterial(), new MeshStandardMaterial({ color: '#226622' })]
  for (let at = 0; at < count; at += 1) {
    const node = modelNodeFixture(`m${at}`, assetId)
    const holder = new Object3D()
    holder.name = node.id
    holder.position.set(at, 0, 0)
    for (let primitive = 0; primitive < primitives; primitive += 1) {
      const mesh = new Mesh(shapes[primitive], paints[primitive])
      if (primitive === 1) mesh.position.set(0, 1.5, 0)
      holder.add(mesh)
    }
    holder.updateMatrixWorld(true)
    markInstanceable(holder, true)
    host.add(holder)
    nodes.push(node)
    objects.set(node.id, holder)
  }
  return { nodes, objects, host }
}

const lotsIn = (host: Object3D): InstancedMesh[] => {
  const lots: InstancedMesh[] = []
  host.traverse(child => {
    if (child instanceof InstancedMesh) lots.push(child)
  })
  return lots
}

describe('shadows of an instanced model', () => {
  it('reads the holder flags onto the lot, and follows a change', () => {
    const { nodes, objects, host } = copies(WORTH_INSTANCING, 2)
    for (const holder of objects.values()) applyShadowFlags(holder, true, false, () => false)
    const groups = createInstancedGroups(host)
    groups.rebuild(nodes, id => objects.get(id))

    expect(lotsIn(host).every(lot => lot.castShadow && !lot.receiveShadow)).toBe(true)

    for (const holder of objects.values()) applyShadowFlags(holder, false, true, () => false)
    groups.rebuild(nodes, id => objects.get(id))

    expect(lotsIn(host).every(lot => !lot.castShadow && lot.receiveShadow)).toBe(true)
  })
})

describe('picking an instanced model', () => {
  it('still names the holder, even when the ray meets a borrowed inner mesh', () => {
    const { nodes, objects, host } = copies(WORTH_INSTANCING, 2)
    const holder = objects.get('m0')
    const inner = holder?.children.find(child => child instanceof Mesh)
    if (!holder || !inner) throw new Error('missing inner mesh')
    createInstancedGroups(host).rebuild(nodes, id => objects.get(id))

    expect(inner.parent).toBe(holder)
    expect(inner.layers.isEnabled(DRAWN_BY_INSTANCE)).toBe(true)
    expect(nodeIdOf(inner, name => objects.has(name))).toBe('m0')
  })
})

describe('stats of an instanced model', () => {
  it('does not count the lots on top of the layer-2 sources the engine already walks', () => {
    const { nodes, objects, host } = copies(WORTH_INSTANCING, 2)
    const groups = createInstancedGroups(host)
    groups.rebuild(nodes, id => objects.get(id))
    groups.hangSources()

    const holders = [...objects.values()]
    const lots = lotsIn(host)
    expect(statsOf(holders).draws).toBe(WORTH_INSTANCING * 2)
    expect(lots.every(lot => !holders.includes(lot))).toBe(true)
  })
})

describe('a one-primitive model and a mesh', () => {
  it('cross the same floor and fill a cell the same way', () => {
    const models = copies(WORTH_INSTANCING, 1)
    const meshNodes: SceneNode[] = []
    const meshObjects = new Map<string, Object3D>()
    const meshHost = new Object3D()
    const geometry = new BoxGeometry(1, 1, 1)
    const material = new MeshStandardMaterial()
    for (let at = 0; at < WORTH_INSTANCING; at += 1) {
      const node = meshNode(`n${at}`)
      const mesh = new Mesh(geometry, material)
      mesh.position.set(at, 0, 0)
      mesh.updateMatrixWorld(true)
      meshHost.add(mesh)
      meshNodes.push(node)
      meshObjects.set(node.id, mesh)
    }

    const modelGroups = createCellGroups(models.host)
    const meshGroups = createCellGroups(meshHost)
    expect(modelGroups.rebuild(models.nodes, id => models.objects.get(id))).toBe(WORTH_INSTANCING)
    expect(meshGroups.rebuild(meshNodes, id => meshObjects.get(id))).toBe(WORTH_INSTANCING)

    const modelLots = lotsIn(models.host)
    const meshLots = lotsIn(meshHost)
    expect(modelLots).toHaveLength(1)
    expect(meshLots).toHaveLength(1)
    expect(modelLots[0]?.count).toBe(meshLots[0]?.count)
  })
})

describe('twenty copies of a two-primitive model', () => {
  it('draws two lots, not twenty, and keeps every copy where it stands', () => {
    const count = 20
    const { nodes, objects, host } = copies(count, 2)
    const before = count * 2
    const instanced = createInstancedGroups(host).rebuild(nodes, id => objects.get(id))

    expect(instanced).toBe(before)
    const lots = lotsIn(host)
    expect(lots).toHaveLength(2)
    expect(lots.map(lot => lot.count)).toEqual([count, count])

    const held = new Matrix4()
    const xs = new Set<number>()
    for (const lot of lots) {
      for (let slot = 0; slot < lot.count; slot += 1) {
        lot.getMatrixAt(slot, held)
        xs.add(held.elements[12] ?? -1)
      }
    }
    expect([...xs].toSorted((a, b) => a - b)).toEqual([...Array(count).keys()])
  })
})
