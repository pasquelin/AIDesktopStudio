import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Object3D, Raycaster, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { WORTH_INSTANCING, type InstancedGroups } from './grouping'
import { createBatchedGroups } from './batching'
import { createCellGroups } from './cellInstancing'
import { createInstancedGroups } from './instancing'
import { markInstanceable } from './instanceableModel'
import { meshNode, modelNodeFixture } from './scene-fixtures'
import { nodeIdOf } from './sceneRendererSupport2'
import type { SceneNode } from './sceneState'

/** One shape and one paint, spaced so a ray straight down meets exactly one of them. */
function alike(count: number): { nodes: SceneNode[]; objects: Map<string, Mesh> } {
  const geometry = new BoxGeometry(1, 1, 1)
  const material = new MeshStandardMaterial()
  const nodes: SceneNode[] = []
  const objects = new Map<string, Mesh>()
  for (let at = 0; at < count; at += 1) {
    const node = meshNode(`n${at}`)
    const mesh = new Mesh(geometry, material)
    mesh.name = node.id
    mesh.position.set(at * 2, 0, 0)
    mesh.updateMatrixWorld(true)
    nodes.push(node)
    objects.set(node.id, mesh)
  }
  return { nodes, objects }
}

// A source held out of the walk is out of the ray's targets too, so a strategy that draws for a
// body owes the click its name. One of the three answered `null` and only a click would have said.
describe.each([
  ['cells', createCellGroups],
  ['batched', createBatchedGroups],
  ['instanced', createInstancedGroups],
])('%s: what a click meets once the sources are held out', (_strategy, group) => {
  it('names the node behind every body it draws for', () => {
    const scene = new Object3D()
    const groups = group(scene)
    const { nodes, objects } = alike(WORTH_INSTANCING)
    groups.rebuild(nodes, id => objects.get(id))
    scene.updateMatrixWorld(true)

    const targets = [...groups.pickable()]
    const held = [...objects].filter(([, mesh]) => groups.holdsSource(mesh))
    expect(held.length).toBe(WORTH_INSTANCING)

    for (const [id, mesh] of held) {
      const from = new Vector3(mesh.position.x, 10, mesh.position.z)
      const hit = new Raycaster(from, new Vector3(0, -1, 0)).intersectObjects(targets, false)[0]
      expect(hit && groups.nodeIdOf(hit)).toBe(id)
    }
  })
})

describe.each([
  ['cells', createCellGroups],
  ['batched', createBatchedGroups],
  ['instanced', createInstancedGroups],
])('%s: editor picking representation', (_strategy, group) => {
  it('resolves every detached source without changing its node identity', () => {
    const scene = new Object3D()
    const groups = group(scene)
    const { nodes, objects } = alike(WORTH_INSTANCING)
    groups.rebuild(nodes, id => objects.get(id))

    const targets = [...groups.editorPickable()]
    expect(targets).toHaveLength(WORTH_INSTANCING)
    expect(groups.editorSourceCount()).toBe(WORTH_INSTANCING)
    for (const [id, mesh] of objects) {
      const raycaster = new Raycaster(
        new Vector3(mesh.position.x, 10, mesh.position.z),
        new Vector3(0, -1, 0),
      )
      raycaster.layers.enableAll()
      const hit = raycaster.intersectObjects(targets, false)[0]
      expect(hit && nodeIdOf(hit.object, candidate => objects.has(candidate))).toBe(id)
    }
  })

  it('keeps a moved source pickable at its new position', () => {
    const scene = new Object3D()
    const groups = group(scene)
    const { nodes, objects } = alike(WORTH_INSTANCING)
    groups.rebuild(nodes, id => objects.get(id))
    const moved = objects.get('n5')
    if (!moved) throw new Error('source fixture missing')
    moved.position.set(100, 0, 0)
    moved.updateWorldMatrix(true, false)
    groups.moved(['n5'], id => objects.get(id))

    const raycaster = new Raycaster(new Vector3(100, 10, 0), new Vector3(0, -1, 0))
    raycaster.layers.enableAll()
    const hit = raycaster.intersectObjects([...groups.editorPickable()], false)[0]

    expect(hit && nodeIdOf(hit.object, candidate => objects.has(candidate))).toBe('n5')
  })
})

it('keeps a grouped source pickable while it stays outside the render traversal', () => {
  const scene = new Object3D()
  const groups = createCellGroups(scene)
  const { nodes, objects } = alike(WORTH_INSTANCING)
  scene.add(...objects.values())
  groups.rebuild(nodes, id => objects.get(id))
  scene.updateMatrixWorld(true)

  const source = objects.get('n5')
  if (!source) throw new Error('source fixture missing')
  const raycaster = new Raycaster(
    new Vector3(source.position.x, 10, source.position.z),
    new Vector3(0, -1, 0),
  )
  raycaster.layers.enableAll()
  const hit = raycaster.intersectObject(source, false)[0]

  expect(hit?.object.name).toBe('n5')
  expect(groups.holdsSource(source)).toBe(true)
  expect(source.parent?.children).not.toContain(source)
})

it('exposes the detached primitives of a grouped model to the editor picker', () => {
  const scene = new Object3D()
  const groups = createCellGroups(scene)
  const geometry = new BoxGeometry()
  const material = new MeshStandardMaterial()
  const nodes = Array.from({ length: WORTH_INSTANCING }, (_unused, at) =>
    modelNodeFixture(`model-${at}`),
  )
  const objects = new Map(
    nodes.map((node, at) => {
      const holder = new Group()
      holder.name = node.id
      holder.position.x = at * 3
      holder.add(new Mesh(geometry, material), new Mesh(geometry, material))
      markInstanceable(holder, true)
      scene.add(holder)
      return [node.id, holder]
    }),
  )
  scene.updateMatrixWorld(true)
  groups.rebuild(nodes, id => objects.get(id))

  const targets = groups.editorPickable()
  const raycaster = new Raycaster(new Vector3(15, 10, 0), new Vector3(0, -1, 0))
  raycaster.layers.enableAll()
  const hit = raycaster.intersectObjects([...targets], false)[0]

  expect(targets).toHaveLength(WORTH_INSTANCING * 2)
  expect(hit?.object.parent?.name).toBe('model-5')
})

it('keeps a moved model primitive pickable at its new position', () => {
  const scene = new Object3D()
  const groups = createCellGroups(scene)
  const geometry = new BoxGeometry()
  const material = new MeshStandardMaterial()
  const nodes = Array.from({ length: WORTH_INSTANCING }, (_unused, at) =>
    modelNodeFixture(`model-${at}`),
  )
  const objects = new Map(
    nodes.map((node, at) => {
      const holder = new Group()
      holder.name = node.id
      holder.position.x = at * 3
      holder.add(new Mesh(geometry, material), new Mesh(geometry, material))
      markInstanceable(holder, true)
      scene.add(holder)
      return [node.id, holder]
    }),
  )
  scene.updateMatrixWorld(true)
  groups.rebuild(nodes, id => objects.get(id))

  const moved = objects.get('model-5')
  if (!moved) throw new Error('model fixture missing')
  moved.position.set(500, 0, 0)
  // Exactly what SceneRendererGrouping does on a move, and nothing more.
  moved.updateWorldMatrix(true, false)
  groups.moved(['model-5'], id => objects.get(id))

  const raycaster = new Raycaster(new Vector3(500, 10, 0), new Vector3(0, -1, 0))
  raycaster.layers.enableAll()
  const hit = raycaster.intersectObjects([...groups.editorPickable()], false)[0]

  expect(hit?.object.parent?.name).toBe('model-5')
})

it('draws a moved model primitive at its new position', () => {
  const scene = new Object3D()
  const groups = createCellGroups(scene)
  const geometry = new BoxGeometry()
  const material = new MeshStandardMaterial()
  const nodes = Array.from({ length: WORTH_INSTANCING }, (_unused, at) =>
    modelNodeFixture(`model-${at}`),
  )
  const objects = new Map(
    nodes.map((node, at) => {
      const holder = new Group()
      holder.name = node.id
      holder.position.x = at * 3
      holder.add(new Mesh(geometry, material), new Mesh(geometry, material))
      markInstanceable(holder, true)
      scene.add(holder)
      return [node.id, holder]
    }),
  )
  scene.updateMatrixWorld(true)
  groups.rebuild(nodes, id => objects.get(id))

  const moved = objects.get('model-5')
  if (!moved) throw new Error('model fixture missing')
  moved.position.set(500, 0, 0)
  moved.updateWorldMatrix(true, false)
  groups.moved(['model-5'], id => objects.get(id))

  const raycaster = new Raycaster(new Vector3(500, 10, 0), new Vector3(0, -1, 0))
  raycaster.layers.enableAll()
  const hit = raycaster.intersectObjects([...groups.pickable()], false)[0]

  expect(hit && groups.nodeIdOf(hit)).toBe('model-5')
})

function movedNestedModel(group: (host: Object3D) => InstancedGroups) {
  const scene = new Object3D()
  const groups = group(scene)
  const geometry = new BoxGeometry()
  const material = new MeshStandardMaterial()
  const nodes = Array.from({ length: WORTH_INSTANCING }, (_unused, at) =>
    modelNodeFixture(`model-${at}`),
  )
  const objects = new Map(
    nodes.map((node, at) => {
      const holder = new Group()
      const nested = new Group()
      holder.name = node.id
      holder.position.x = at * 3
      nested.add(new Mesh(geometry, material))
      holder.add(nested)
      markInstanceable(holder, true)
      scene.add(holder)
      return [node.id, holder]
    }),
  )
  scene.updateMatrixWorld(true)
  groups.rebuild(nodes, id => objects.get(id))

  const moved = objects.get('model-5')
  if (!moved) throw new Error('model fixture missing')
  moved.position.set(500, 0, 0)
  moved.updateWorldMatrix(true, false)
  groups.moved(['model-5'], id => objects.get(id))

  return { groups, objects }
}

describe.each([
  ['cells', createCellGroups],
  ['batched', createBatchedGroups],
  ['instanced', createInstancedGroups],
])('%s: a moved primitive below nested model groups', (_strategy, group) => {
  it('remains pickable at its new position', () => {
    const { groups } = movedNestedModel(group)

    const raycaster = new Raycaster(new Vector3(500, 10, 0), new Vector3(0, -1, 0))
    raycaster.layers.enableAll()
    const picked = raycaster.intersectObjects([...groups.editorPickable()], false)[0]

    expect(picked?.object.parent?.parent?.name).toBe('model-5')
  })

  it('remains drawn at its new position', () => {
    const { groups } = movedNestedModel(group)

    const raycaster = new Raycaster(new Vector3(500, 10, 0), new Vector3(0, -1, 0))
    raycaster.layers.enableAll()
    const drawn = raycaster.intersectObjects([...groups.pickable()], false)[0]

    expect(drawn && groups.nodeIdOf(drawn)).toBe('model-5')
  })
})
