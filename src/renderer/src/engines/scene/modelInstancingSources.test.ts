import { BoxGeometry, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Object3D } from 'three'
import { describe, expect, it } from 'vitest'
import { meshNode, modelNodeFixture, walked } from './scene-fixtures'
import { WORTH_INSTANCING } from './grouping'
import { markInstanceable } from './instanceableModel'
import { createInstancedGroups } from './instancing'
import type { SceneNode } from './sceneState'

/** One shape, N nodes of it — a decor someone copied and pasted, which is the case that costs. */
function alike(count: number): { nodes: SceneNode[]; objects: Map<string, Mesh> } {
  const nodes: SceneNode[] = []
  const objects = new Map<string, Mesh>()
  const geometry = new BoxGeometry(1, 1, 1)
  const material = new MeshStandardMaterial()

  for (let at = 0; at < count; at += 1) {
    const node = meshNode(`n${at}`)
    const mesh = new Mesh(geometry, material)
    mesh.position.set(at, 0, 0)
    mesh.updateMatrixWorld(true)
    nodes.push(node)
    objects.set(node.id, mesh)
  }
  return { nodes, objects }
}

const host = () => new Object3D()

const instancesIn = (scene: Object3D): InstancedMesh[] =>
  scene.children.filter(child => child instanceof InstancedMesh)

describe('instancing a model of two primitives', () => {
  function copies(count: number) {
    const nodes: SceneNode[] = []
    const objects = new Map<string, Object3D>()
    const trunkGeom = new BoxGeometry(1, 1, 1)
    const crownGeom = new BoxGeometry(0.4, 2, 0.4)
    const trunkPaint = new MeshStandardMaterial()
    const crownPaint = new MeshStandardMaterial({ color: '#226622' })
    for (let at = 0; at < count; at += 1) {
      const node = modelNodeFixture(`m${at}`, 'tree')
      const holder = new Object3D()
      holder.position.set(at, 0, 0)
      const trunk = new Mesh(trunkGeom, trunkPaint)
      const crown = new Mesh(crownGeom, crownPaint)
      crown.position.set(0, 1.5, 0)
      holder.add(trunk, crown)
      holder.updateMatrixWorld(true)
      markInstanceable(holder, true)
      nodes.push(node)
      objects.set(node.id, holder)
    }
    return { nodes, objects }
  }

  it('draws two lots for one node id, each holding every copy', () => {
    const scene = host()
    const { nodes, objects } = copies(WORTH_INSTANCING)
    for (const holder of objects.values()) scene.add(holder)
    const count = createInstancedGroups(scene).rebuild(nodes, id => objects.get(id))

    expect(count).toBe(WORTH_INSTANCING * 2)
    const lots = instancesIn(scene)
    expect(lots).toHaveLength(2)
    expect(lots.map(lot => lot.count)).toEqual([WORTH_INSTANCING, WORTH_INSTANCING])
  })

  it('stores both primitives of one node at their world poses', () => {
    const scene = host()
    const { nodes, objects } = copies(WORTH_INSTANCING)
    for (const holder of objects.values()) scene.add(holder)
    createInstancedGroups(scene).rebuild(nodes, id => objects.get(id))

    const held = new Matrix4()
    const ys = instancesIn(scene).map(lot => {
      lot.getMatrixAt(0, held)
      return held.elements[13] ?? -1
    })
    expect(ys.toSorted()).toEqual([0, 1.5])
  })
})

describe('the sources a group draws for', () => {
  /** Hung where the engine hangs them: under the scene, which is what a render walks. */
  const hungIn = (scene: Object3D, objects: Map<string, Mesh>): void => {
    for (const mesh of objects.values()) scene.add(mesh)
  }

  it('leave the walk of the scene, which is what a frame pays for them', () => {
    const scene = host()
    const { nodes, objects } = alike(WORTH_INSTANCING)
    hungIn(scene, objects)
    createInstancedGroups(scene).rebuild(nodes, id => objects.get(id))

    for (const mesh of objects.values()) expect(walked(scene)).not.toContain(mesh)
  })

  it('go on hanging from the node they belong to, which is what answers upward', () => {
    const scene = host()
    const { nodes, objects } = alike(WORTH_INSTANCING)
    hungIn(scene, objects)
    createInstancedGroups(scene).rebuild(nodes, id => objects.get(id))

    for (const mesh of objects.values()) expect(mesh.parent).toBe(scene)
  })

  it('come back to the walk when their group shrinks under the floor', () => {
    const scene = host()
    const groups = createInstancedGroups(scene)
    const { nodes, objects } = alike(WORTH_INSTANCING)
    hungIn(scene, objects)
    groups.rebuild(nodes, id => objects.get(id))

    groups.rebuild(nodes.slice(0, 4), id => objects.get(id))
    for (const node of nodes.slice(0, 4)) {
      expect(walked(scene)).toContain(objects.get(node.id))
    }
  })

  it('come back to it when the engine goes', () => {
    const scene = host()
    const groups = createInstancedGroups(scene)
    const { nodes, objects } = alike(WORTH_INSTANCING)
    hungIn(scene, objects)
    groups.rebuild(nodes, id => objects.get(id))

    groups.dispose()
    for (const mesh of objects.values()) expect(walked(scene)).toContain(mesh)
  })

  it('leave it wearing the edges hung under them, which stand for no node', () => {
    const scene = host()
    const { nodes, objects } = alike(WORTH_INSTANCING)
    hungIn(scene, objects)
    const edges = new Object3D()
    edges.name = 'overlay'
    objects.get('n0')?.add(edges)

    createInstancedGroups(scene).rebuild(nodes, id => objects.get(id))

    expect(walked(scene)).not.toContain(objects.get('n0'))
  })

  it('stay in it when a node of its own hangs from one, which would go off the graph with it', () => {
    const scene = host()
    const { nodes, objects } = alike(WORTH_INSTANCING)
    hungIn(scene, objects)
    const carrier = objects.get('n0')
    // Read off the DOCUMENT: the last pass may already have taken that child out of `children`,
    // and a test on the live array would let its parent go on the second rebuild.
    const lamp = meshNode('lamp', 'n0')
    const bulb = new Object3D()
    bulb.name = 'lamp'
    carrier?.add(bulb)
    objects.set('lamp', bulb as Mesh)

    const groups = createInstancedGroups(scene)
    const count = groups.rebuild([...nodes, lamp], id => objects.get(id))
    groups.rebuild([...nodes, lamp], id => objects.get(id))

    // Still DRAWN by the instance — only its place in the tree is kept.
    expect(count).toBe(WORTH_INSTANCING)
    expect(walked(scene)).toContain(carrier)
    expect(walked(scene)).not.toContain(objects.get('n1'))
  })

  it('go back where a caller reads the tree, and out again after', () => {
    const scene = host()
    const groups = createInstancedGroups(scene)
    const { nodes, objects } = alike(WORTH_INSTANCING)
    hungIn(scene, objects)
    groups.rebuild(nodes, id => objects.get(id))

    groups.hangSources()
    const seen = walked(scene)
    groups.dropSources()

    for (const mesh of objects.values()) {
      expect(seen).toContain(mesh)
      expect(walked(scene)).not.toContain(mesh)
    }
  })
})
