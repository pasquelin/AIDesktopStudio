import {
  BoxGeometry,
  IcosahedronGeometry,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Raycaster,
  Vector3,
} from 'three'
import { describe, expect, it } from 'vitest'
import { EDGE_LAYER } from './sceneView'
import { meshNode, modelNodeFixture } from './scene-fixtures'
import { DRAWN_BY_INSTANCE, WORTH_INSTANCING } from './grouping'
import { createInstancedGroups, keepsItsGroup } from './instancing'
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

/** The same, of a shape dense enough to be worth splitting, spread over a level. */
function spread(count: number, over: number): { nodes: SceneNode[]; objects: Map<string, Mesh> } {
  const nodes: SceneNode[] = []
  const objects = new Map<string, Mesh>()
  const geometry = new IcosahedronGeometry(0.5, 2)
  const material = new MeshStandardMaterial()

  const side = Math.ceil(Math.sqrt(count))
  for (let at = 0; at < count; at += 1) {
    const node = meshNode(`n${at}`)
    const mesh = new Mesh(geometry, material)
    mesh.position.set(((at % side) * over) / side, 0, (Math.floor(at / side) * over) / side)
    mesh.updateMatrixWorld(true)
    nodes.push(node)
    objects.set(node.id, mesh)
  }
  return { nodes, objects }
}

/** Enough of a 320-triangle shape for the split to be worth several regions. */
const SPLIT_WORTHY = 2_000

const host = () => new Object3D()

const instancesIn = (scene: Object3D): InstancedMesh[] =>
  scene.children.filter(child => child instanceof InstancedMesh)

describe('the layer a hidden mesh goes to', () => {
  it('is not one another pass turns back on', () => {
    // A view that shows edges enables `EDGE_LAYER` on its camera. Shared, that number put every
    // hidden mesh back on screen beside the instance drawing it: a tight view of 10 000 went
    // from 3.7 ms and 40 calls to 12.6 ms and 9 605, and the geometry was drawn twice over.
    expect(DRAWN_BY_INSTANCE).not.toBe(EDGE_LAYER)
    expect(DRAWN_BY_INSTANCE).not.toBe(0)
  })
})

describe('createInstancedGroups', () => {
  it('leaves an ordinary scene alone, drawing nothing of its own', () => {
    const scene = host()
    const { nodes, objects } = alike(WORTH_INSTANCING - 1)

    expect(createInstancedGroups(scene).rebuild(nodes, id => objects.get(id))).toBe(0)
    expect(scene.children).toHaveLength(0)
    // Still the camera's layer: nothing else would draw them.
    expect([...objects.values()].every(mesh => mesh.layers.test(new Mesh().layers))).toBe(true)
  })

  it('draws a repeated shape through one instance', () => {
    const scene = host()
    const { nodes, objects } = alike(WORTH_INSTANCING)
    const count = createInstancedGroups(scene).rebuild(nodes, id => objects.get(id))

    expect(count).toBe(WORTH_INSTANCING)
    expect(scene.children).toHaveLength(1)
  })

  it('takes the meshes off the camera layer, and off it alone', () => {
    const scene = host()
    const { nodes, objects } = alike(WORTH_INSTANCING)
    createInstancedGroups(scene).rebuild(nodes, id => objects.get(id))

    // What keeps picking alive: they are still in `objects`, matrices and all — just neither
    // drawn nor walked, which is a layer and a place in the tree, not the same thing.
    for (const mesh of objects.values()) {
      expect(mesh.layers.isEnabled(DRAWN_BY_INSTANCE)).toBe(true)
      expect(mesh.layers.isEnabled(0)).toBe(false)
    }
  })

  it('places each instance where its mesh stands', () => {
    const scene = host()
    const { nodes, objects } = alike(WORTH_INSTANCING)
    createInstancedGroups(scene).rebuild(nodes, id => objects.get(id))

    const instance = scene.children[0]
    if (!(instance instanceof InstancedMesh)) throw new Error('no instance was built')
    // The third instance sits where the third mesh does — x = 2, as `alike` laid them out.
    expect(instance.instanceMatrix.array[2 * 16 + 12]).toBe(2)
  })

  it('carries the shadow flags of the meshes it draws for', () => {
    const scene = host()
    const { nodes, objects } = alike(WORTH_INSTANCING)
    for (const mesh of objects.values()) {
      mesh.castShadow = true
      mesh.receiveShadow = true
    }
    createInstancedGroups(scene).rebuild(nodes, id => objects.get(id))

    // The sources sit on a layer the shadow camera never looks at. Left at their default, an
    // instanced object neither cast a shadow nor caught one — and no gate went red.
    const instance = instancesIn(scene)[0]
    expect({ cast: instance?.castShadow, receive: instance?.receiveShadow }).toEqual({
      cast: true,
      receive: true,
    })
  })

  it('separates two meshes that answer differently to a shadow', () => {
    const scene = host()
    const { nodes, objects } = alike(WORTH_INSTANCING)
    for (const mesh of objects.values()) mesh.castShadow = true
    const first = objects.get('n0')
    if (first) first.castShadow = false

    // One instance carries ONE flag: mixed, it would answer for a node that said the opposite.
    // Split, neither half reaches the floor, so nothing is instanced at all.
    expect(createInstancedGroups(scene).rebuild(nodes, id => objects.get(id))).toBe(0)
  })

  /**
   * The mark decides a per-node LOOK, so it decides a group. An instance draws the first member's
   * own material — the very object `applyNegative` reddens — so one marked brick among sixty-four
   * would have turned the whole wall red, and its own repaint would have been drawn by nobody.
   */
  it('separates a shape marked as a tool from the ones that are not', () => {
    const scene = host()
    const { nodes, objects } = alike(WORTH_INSTANCING)
    const first = nodes[0]
    if (first?.type === 'mesh') nodes[0] = { ...first, negative: true }

    expect(createInstancedGroups(scene).rebuild(nodes, id => objects.get(id))).toBe(0)
  })

  it('separates two shapes that no single draw call could share', () => {
    const scene = host()
    const { nodes, objects } = alike(WORTH_INSTANCING * 2)
    // Half of them become spheres: same count, two groups, and each still over the floor.
    for (const [at, node] of nodes.entries()) {
      if (at % 2 === 0 || node.type !== 'mesh') continue
      nodes[at] = {
        ...node,
        geometry: { kind: 'sphere', radius: 1, widthSegments: 8, heightSegments: 8 },
      }
    }
    createInstancedGroups(scene).rebuild(nodes, id => objects.get(id))

    expect(scene.children).toHaveLength(2)
  })

  it('gives a shrunken group back to the camera, rather than leaving it invisible', () => {
    const scene = host()
    const groups = createInstancedGroups(scene)
    const { nodes, objects } = alike(WORTH_INSTANCING)
    groups.rebuild(nodes, id => objects.get(id))

    groups.rebuild(nodes.slice(0, 4), id => objects.get(id))
    for (const node of nodes.slice(0, 4)) {
      expect(objects.get(node.id)?.layers.isEnabled(0)).toBe(true)
    }
    expect(scene.children).toHaveLength(0)
  })

  it('skips a mesh the scene does not draw, whoever hid it', () => {
    const scene = host()
    const { nodes, objects } = alike(WORTH_INSTANCING)
    for (const mesh of objects.values()) mesh.visible = false

    // Read off the object rather than the node: the viewport isolates on top of what the
    // document hides, and only the object carries both. Instanced, a hidden mesh comes back —
    // an `InstancedMesh` never consults the meshes it stands for.
    expect(createInstancedGroups(scene).rebuild(nodes, id => objects.get(id))).toBe(0)
  })

  it('skips a mesh hanging from something hidden, which three.js would not draw either', () => {
    const scene = host()
    const { nodes, objects } = alike(WORTH_INSTANCING)
    const branch = new Object3D()
    branch.visible = false
    scene.add(branch)
    for (const mesh of objects.values()) branch.add(mesh)

    expect(createInstancedGroups(scene).rebuild(nodes, id => objects.get(id))).toBe(0)
  })

  it('regroups a node repainted since the last pass, rather than the spelling it had', () => {
    const scene = host()
    const groups = createInstancedGroups(scene)
    const { nodes, objects } = alike(WORTH_INSTANCING)
    groups.rebuild(nodes, id => objects.get(id))

    const first = nodes[0]
    if (!first || first.type !== 'mesh') throw new Error('no node to repaint')
    // A node is REPLACED when it is edited, which is what the spelling is held against. Held
    // against its id instead, a repaint would keep drawing the colour it had.
    nodes[0] = { ...first, material: { ...first.material, color: '#ff0000' } }

    // One shape short of the floor on each side, so neither half is drawn by an instance.
    expect(groups.rebuild(nodes, id => objects.get(id))).toBe(0)
  })

  it('takes its meshes away when the engine goes', () => {
    const scene = host()
    const groups = createInstancedGroups(scene)
    const { nodes, objects } = alike(WORTH_INSTANCING)
    groups.rebuild(nodes, id => objects.get(id))

    groups.dispose()
    expect(scene.children).toHaveLength(0)
  })
})

describe('picking a body through the instance that draws it', () => {
  it('maps the raycast instance slot back to the source node', () => {
    const scene = host()
    const groups = createInstancedGroups(scene)
    const { nodes, objects } = alike(WORTH_INSTANCING)
    groups.rebuild(nodes, id => objects.get(id))
    scene.updateMatrixWorld(true)
    const raycaster = new Raycaster(new Vector3(5, 10, 0), new Vector3(0, -1, 0))

    const instance = groups.pickable()[0]
    if (!instance) throw new Error('nothing was instanced')
    const hit = raycaster.intersectObject(instance, false)[0]

    expect(hit?.instanceId).toBe(5)
    expect(hit ? groups.nodeIdOf(hit) : null).toBe('n5')
  })

  it('answers nothing for an object or slot no instance owns', () => {
    const scene = host()
    const groups = createInstancedGroups(scene)
    const { nodes, objects } = alike(WORTH_INSTANCING)
    groups.rebuild(nodes, id => objects.get(id))
    const instance = groups.pickable()[0]
    if (!instance) throw new Error('nothing was instanced')

    expect(
      groups.nodeIdOf({ object: new Mesh(), distance: 1, point: new Vector3(), instanceId: 0 }),
    ).toBeNull()
    expect(
      groups.nodeIdOf({ object: instance, distance: 1, point: new Vector3(), instanceId: 999 }),
    ).toBeNull()
    expect(groups.nodeIdOf({ object: instance, distance: 1, point: new Vector3() })).toBeNull()
  })
})

describe('splitting a group across the level it covers', () => {
  it('draws a spread-out shape through one instance per region', () => {
    const scene = host()
    const { nodes, objects } = spread(SPLIT_WORTHY, 600)
    createInstancedGroups(scene).rebuild(nodes, id => objects.get(id))

    // One sphere for the whole level is one sphere the frustum can never say no to.
    expect(instancesIn(scene).length).toBeGreaterThan(1)
  })

  it('draws every mesh once across the regions, and none of them twice', () => {
    const scene = host()
    const { nodes, objects } = spread(SPLIT_WORTHY, 600)
    createInstancedGroups(scene).rebuild(nodes, id => objects.get(id))

    const drawn = instancesIn(scene).reduce((all, instance) => all + instance.count, 0)
    expect(drawn).toBe(SPLIT_WORTHY)
  })

  it('gives each region bounds of its own, tight enough to be culled', () => {
    const scene = host()
    const { nodes, objects } = spread(SPLIT_WORTHY, 600)
    createInstancedGroups(scene).rebuild(nodes, id => objects.get(id))

    // Bounds as wide as the level would pass every frustum test and cull nothing at all.
    for (const instance of instancesIn(scene)) {
      expect(instance.boundingSphere?.radius ?? Infinity).toBeLessThan(300)
    }
  })

  it('leaves a shape too cheap to split drawn in a single call', () => {
    const scene = host()
    // Cubes: twelve triangles, under the floor where the draw calls of a split earn it back.
    const { nodes, objects } = alike(SPLIT_WORTHY)
    createInstancedGroups(scene).rebuild(nodes, id => objects.get(id))

    expect(instancesIn(scene)).toHaveLength(1)
  })
})

describe('a node dragged while its instance draws it', () => {
  const drawnBy = (scene: Object3D): InstancedMesh => {
    const instance = instancesIn(scene)[0]
    if (!instance) throw new Error('nothing was instanced')
    return instance
  }

  it('follows the mesh, without waiting for the gesture to end', () => {
    const scene = host()
    const groups = createInstancedGroups(scene)
    const { nodes, objects } = alike(WORTH_INSTANCING)
    groups.rebuild(nodes, id => objects.get(id))

    const mesh = objects.get('n0')
    if (!mesh) throw new Error('no mesh to drag')
    mesh.position.set(0, 9, 0)
    mesh.updateMatrixWorld(true)

    expect(groups.moved(['n0'], id => objects.get(id))).toBe(true)
    // Slot 0 of the buffer, thirteenth number of its matrix: where the mesh now stands.
    expect(drawnBy(scene).instanceMatrix.array[13]).toBe(9)
  })

  it('asks for the moved slot alone to be uploaded again', () => {
    const scene = host()
    const groups = createInstancedGroups(scene)
    const { nodes, objects } = alike(WORTH_INSTANCING)
    groups.rebuild(nodes, id => objects.get(id))
    drawnBy(scene).instanceMatrix.clearUpdateRanges()

    groups.moved(['n0'], id => objects.get(id))

    // Sixty-four matrices re-uploaded per pointer move is what this exists to give back.
    expect(drawnBy(scene).instanceMatrix.updateRanges).toEqual([{ start: 0, count: 16 }])
  })

  it('grows the region bounds rather than let a dragged node be culled out of them', () => {
    const scene = host()
    const groups = createInstancedGroups(scene)
    const { nodes, objects } = alike(WORTH_INSTANCING)
    groups.rebuild(nodes, id => objects.get(id))
    const before = drawnBy(scene).boundingSphere?.radius ?? 0

    const mesh = objects.get('n0')
    if (!mesh) throw new Error('no mesh to drag')
    mesh.position.set(0, 500, 0)
    mesh.updateMatrixWorld(true)
    groups.moved(['n0'], id => objects.get(id))

    // A predicate that stayed put would make the dragged object VANISH the moment it left.
    expect(drawnBy(scene).boundingSphere?.radius ?? 0).toBeGreaterThan(before)
  })

  it('says nothing moved when no instance draws the node', () => {
    const scene = host()
    const groups = createInstancedGroups(scene)
    const { nodes, objects } = alike(WORTH_INSTANCING - 1)
    groups.rebuild(nodes, id => objects.get(id))

    expect(groups.moved(['n0'], id => objects.get(id))).toBe(false)
  })
})

describe('keepsItsGroup', () => {
  it('keeps a node whose placement is all that moved', () => {
    const node = meshNode('n0')

    // What a draw call is grouped by has not moved, so neither has the group — and rewriting one
    // slot costs 3.5 µs against 32.7 ms to group 40 000 nodes again.
    const moved = { ...node.transform, position: { x: 4, y: 0, z: 0 } }

    expect(keepsItsGroup(node, { ...node, transform: moved })).toBe(true)
  })

  it('lets go of a node whose grouping inputs or optimization intent changed', () => {
    const node = meshNode('n0')
    const elsewhere: Partial<typeof node>[] = [
      { geometry: { kind: 'sphere', radius: 1, widthSegments: 8, heightSegments: 8 } },
      { material: { ...node.material, color: '#ff0000' } },
      { visible: false },
      { parentId: 'other' },
      { castShadow: !node.castShadow },
      { receiveShadow: !node.receiveShadow },
      // An instance draws the FIRST member's own material, so a brick marked as a tool inside a
      // wall of sixty-four would either stay grey or turn the whole wall red.
      { negative: true },
      { optimization: { mode: 'exclude' } },
    ]

    // Each of the seven is read by the grouping: kept, the node would go on being drawn by an
    // instance that spells something it no longer is — a shadow that will not go away among
    // them, since the source that stopped casting is the one nothing draws.
    for (const moved of elsewhere) {
      expect(keepsItsGroup(node, { ...node, ...moved })).toBe(false)
    }
  })

  it('keeps a model whose placement is all that moved', () => {
    const node = modelNodeFixture('tree')
    const moved = { ...node.transform, position: { x: 4, y: 0, z: 0 } }
    expect(keepsItsGroup(node, { ...node, transform: moved })).toBe(true)
  })

  it('lets go of a model whose asset, dress, shadow or optimization intent changed', () => {
    const node = modelNodeFixture('tree')
    expect(keepsItsGroup(node, { ...node, model: { assetId: 'other' } })).toBe(false)
    expect(
      keepsItsGroup(node, {
        ...node,
        model: { ...node.model, dress: { kind: 'image', assetId: 'pic-1' } },
      }),
    ).toBe(false)
    expect(keepsItsGroup(node, { ...node, castShadow: !node.castShadow })).toBe(false)
    expect(keepsItsGroup(node, { ...node, optimization: { mode: 'exclude' } })).toBe(false)
  })
})
