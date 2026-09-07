import {
  BatchedMesh,
  BoxGeometry,
  IcosahedronGeometry,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Raycaster,
  SphereGeometry,
  Vector3,
  type BufferGeometry,
  type Material,
} from 'three'
import { describe, expect, it } from 'vitest'
import { groupNodeFixture, meshNode, modelNodeFixture } from './scene-fixtures'
import { createBatchedGroups } from './batching'
import { acceleratedRaycast } from 'three-mesh-bvh'
import { DRAWN_BY_INSTANCE, groupingExclusions, WORTH_INSTANCING } from './grouping'
import type { MeshNode, SceneNode } from './sceneState'
import { markInstanceable } from './instanceableModel'

type Built = { nodes: SceneNode[]; objects: Map<string, Mesh> }

/** A shape as the engine sees it: the object drawn, and the descriptor the node is keyed by. */
type Shape = { geometry: BufferGeometry; descriptor: MeshNode['geometry'] }
type Paint = { material: Material; color: string }

const BOX: Shape = { geometry: new BoxGeometry(1, 1, 1), descriptor: meshNode('x').geometry }
const SPHERE: Shape = {
  geometry: new SphereGeometry(0.5, 8, 6),
  descriptor: { kind: 'sphere', radius: 0.5, widthSegments: 8, heightSegments: 6 },
}
const RED: Paint = { material: new MeshStandardMaterial({ color: '#ff0000' }), color: '#ff0000' }
const BLUE: Paint = { material: new MeshStandardMaterial({ color: '#0000ff' }), color: '#0000ff' }

/** N nodes in a row along x, each wearing the shape and paint its index picks. */
function laidOut(
  count: number,
  shapeOf: (at: number) => Shape = () => BOX,
  paintOf: (at: number) => Paint = () => RED,
): Built {
  const nodes: SceneNode[] = []
  const objects = new Map<string, Mesh>()
  for (let at = 0; at < count; at += 1) {
    const shape = shapeOf(at)
    const paint = paintOf(at)
    const base = meshNode(`n${at}`)
    nodes.push({
      ...base,
      geometry: shape.descriptor,
      material: { ...base.material, color: paint.color },
    })
    const mesh = new Mesh(shape.geometry, paint.material)
    mesh.position.set(at * 3, 0, 0)
    mesh.updateMatrixWorld(true)
    objects.set(base.id, mesh)
  }
  return { nodes, objects }
}

const host = () => new Object3D()

const batchesIn = (scene: Object3D): BatchedMesh[] =>
  scene.children.filter(child => child instanceof BatchedMesh)

const onlyBatch = (scene: Object3D): BatchedMesh => {
  const batch = batchesIn(scene)[0]
  if (!batch) throw new Error('nothing was batched')
  return batch
}

/** A ray straight down onto the node at x = 3·at, the way `laidOut` placed it. */
const rayOnto = (at: number): Raycaster => {
  const raycaster = new Raycaster()
  raycaster.layers.enableAll()
  raycaster.set(new Vector3(at * 3, 10, 0), new Vector3(0, -1, 0))
  return raycaster
}

describe('createBatchedGroups', () => {
  it('leaves a scene under the floor alone, drawing nothing of its own', () => {
    const scene = host()
    const { nodes, objects } = laidOut(WORTH_INSTANCING - 1)

    expect(createBatchedGroups(scene).rebuild(nodes, id => objects.get(id))).toBe(0)
    expect(scene.children).toHaveLength(0)
    expect([...objects.values()].every(mesh => mesh.layers.isEnabled(0))).toBe(true)
  })

  it('draws every shape wearing one material through a single batch', () => {
    const scene = host()
    // Two shapes, one paint: the instanced path needed two groups of 16, this needs one lot.
    const { nodes, objects } = laidOut(WORTH_INSTANCING, at => (at % 2 === 0 ? BOX : SPHERE))

    expect(createBatchedGroups(scene).rebuild(nodes, id => objects.get(id))).toBe(WORTH_INSTANCING)
    expect(batchesIn(scene)).toHaveLength(1)
    expect(onlyBatch(scene).instanceCount).toBe(WORTH_INSTANCING)
  })

  it('opens one lot per material, since a call draws one material', () => {
    const scene = host()
    const { nodes, objects } = laidOut(
      WORTH_INSTANCING * 2,
      () => BOX,
      at => (at % 2 === 0 ? RED : BLUE),
    )
    createBatchedGroups(scene).rebuild(nodes, id => objects.get(id))

    expect(batchesIn(scene)).toHaveLength(2)
  })

  it('takes the meshes off the camera layer, and off it alone', () => {
    const scene = host()
    const { nodes, objects } = laidOut(WORTH_INSTANCING)
    createBatchedGroups(scene).rebuild(nodes, id => objects.get(id))

    for (const mesh of objects.values()) {
      expect(mesh.layers.isEnabled(DRAWN_BY_INSTANCE)).toBe(true)
      expect(mesh.layers.isEnabled(0)).toBe(false)
    }
  })

  it('places each instance where its mesh stands', () => {
    const scene = host()
    const { nodes, objects } = laidOut(WORTH_INSTANCING)
    createBatchedGroups(scene).rebuild(nodes, id => objects.get(id))

    const placed = new Matrix4()
    onlyBatch(scene).getMatrixAt(2, placed)
    expect(placed.elements[12]).toBe(6)
  })

  it('culls and sorts per object, which is what a lot is for', () => {
    const scene = host()
    const { nodes, objects } = laidOut(WORTH_INSTANCING)
    createBatchedGroups(scene).rebuild(nodes, id => objects.get(id))

    expect(onlyBatch(scene).perObjectFrustumCulled).toBe(true)
    expect(onlyBatch(scene).sortObjects).toBe(true)
  })

  it('carries the shadow flags of the meshes it draws for', () => {
    const scene = host()
    const { nodes, objects } = laidOut(WORTH_INSTANCING)
    for (const mesh of objects.values()) {
      mesh.castShadow = true
      mesh.receiveShadow = true
    }
    createBatchedGroups(scene).rebuild(nodes, id => objects.get(id))

    expect({ cast: onlyBatch(scene).castShadow, receive: onlyBatch(scene).receiveShadow }).toEqual({
      cast: true,
      receive: true,
    })
  })

  it('separates a mesh that answers differently to a shadow, or is marked as a tool', () => {
    const scene = host()
    const { nodes, objects } = laidOut(WORTH_INSTANCING)
    for (const mesh of objects.values()) mesh.castShadow = true
    const first = objects.get('n0')
    if (first) first.castShadow = false
    const second = nodes[1]
    if (second?.type === 'mesh') nodes[1] = { ...second, negative: true }

    // A lot carries ONE flag of each and draws one material: the two that differ leave it, and
    // what remains is short of the floor.
    expect(createBatchedGroups(scene).rebuild(nodes, id => objects.get(id))).toBe(0)
  })

  it('keeps a shape without an index out of a lot that has one, rather than throwing', () => {
    const scene = host()
    // A polyhedron is NOT indexed where a box is: three refuses to mix them in one geometry.
    const knot: Shape = { geometry: new IcosahedronGeometry(0.5, 1), descriptor: SPHERE.descriptor }
    const { nodes, objects } = laidOut(WORTH_INSTANCING * 2, at => (at % 2 === 0 ? BOX : knot))

    expect(createBatchedGroups(scene).rebuild(nodes, id => objects.get(id))).toBe(
      WORTH_INSTANCING * 2,
    )
    expect(batchesIn(scene)).toHaveLength(2)
  })

  it('leaves a mesh wearing several materials to be drawn alone', () => {
    const scene = host()
    const { nodes, objects } = laidOut(WORTH_INSTANCING + 1)
    const first = objects.get('n0')
    if (first) first.material = [RED.material, BLUE.material]

    expect(createBatchedGroups(scene).rebuild(nodes, id => objects.get(id))).toBe(WORTH_INSTANCING)
    expect(first?.layers.isEnabled(0)).toBe(true)
  })

  it('skips a mesh the scene does not draw, whoever hid it', () => {
    const scene = host()
    const { nodes, objects } = laidOut(WORTH_INSTANCING)
    for (const mesh of objects.values()) mesh.visible = false

    expect(createBatchedGroups(scene).rebuild(nodes, id => objects.get(id))).toBe(0)
  })

  it('leaves gameplay and timeline driven meshes individually addressable', () => {
    const scene = host()
    const { nodes, objects } = laidOut(WORTH_INSTANCING + 3)
    const movement = nodes[0]
    const script = nodes[1]
    const animated = nodes[2]
    if (!movement || !script || !animated) throw new Error('missing driven fixtures')
    nodes[0] = { ...movement, components: [{ type: 'Movement' }] }
    nodes[1] = { ...script, components: [{ type: 'Script' }] }

    const exclusions = groupingExclusions(nodes, new Set([animated.id]))
    expect(createBatchedGroups(scene).rebuild(nodes, id => objects.get(id), exclusions)).toBe(
      WORTH_INSTANCING,
    )
    for (const id of [movement.id, script.id, animated.id]) {
      expect(objects.get(id)?.layers.isEnabled(0)).toBe(true)
    }
  })

  it('keeps user overrides out of an incompatible grouping strategy', () => {
    const nodes: SceneNode[] = [
      { ...meshNode('individual'), optimization: { mode: 'individual' } },
      { ...meshNode('instances'), optimization: { mode: 'instance' } },
      { ...meshNode('batches'), optimization: { mode: 'batch' } },
      { ...meshNode('excluded'), optimization: { mode: 'exclude' } },
    ]

    expect([...groupingExclusions(nodes, new Set(), 'instance')]).toEqual([
      'individual',
      'batches',
      'excluded',
    ])
    expect([...groupingExclusions(nodes, new Set(), 'batch')]).toEqual([
      'individual',
      'instances',
      'excluded',
    ])
  })

  it('honours a forced compatible strategy below the automatic threshold', () => {
    const scene = host()
    const { nodes, objects } = laidOut(1)
    const node = nodes[0]
    if (!node) throw new Error('missing forced fixture')
    const forced: SceneNode = { ...node, optimization: { mode: 'batch' } }

    expect(
      createBatchedGroups(scene).rebuild(
        [forced],
        id => objects.get(id),
        groupingExclusions([forced], new Set(), 'batch'),
      ),
    ).toBe(1)
  })

  it('batches compatible primitives from different model assets when they share a material', () => {
    const scene = host()
    const nodes: SceneNode[] = []
    const objects = new Map<string, Object3D>()
    for (let at = 0; at < 2; at += 1) {
      const node: SceneNode = {
        ...modelNodeFixture(`model-${at}`, `asset-${at}`),
        optimization: { mode: 'batch' },
      }
      const holder = new Object3D()
      holder.add(new Mesh(new BoxGeometry(at + 1, 1, 1), new MeshStandardMaterial()))
      markInstanceable(holder, true)
      scene.add(holder)
      holder.updateMatrixWorld(true)
      nodes.push(node)
      objects.set(node.id, holder)
    }

    const groups = createBatchedGroups(scene)
    expect(groups.rebuild(nodes, id => objects.get(id))).toBe(2)
    expect(batchesIn(scene)).toHaveLength(1)
  })

  it('keeps visually different model materials in separate forced batches', () => {
    const scene = host()
    const nodes: SceneNode[] = []
    const objects = new Map<string, Object3D>()
    for (let at = 0; at < 2; at += 1) {
      const node: SceneNode = {
        ...modelNodeFixture(`model-${at}`, `asset-${at}`),
        optimization: { mode: 'batch' },
      }
      const holder = new Object3D()
      holder.add(
        new Mesh(
          new BoxGeometry(at + 1, 1, 1),
          new MeshStandardMaterial({ color: at === 0 ? '#ffffff' : '#000000' }),
        ),
      )
      markInstanceable(holder, true)
      scene.add(holder)
      holder.updateMatrixWorld(true)
      nodes.push(node)
      objects.set(node.id, holder)
    }

    const groups = createBatchedGroups(scene)
    expect(groups.rebuild(nodes, id => objects.get(id))).toBe(2)
    expect(batchesIn(scene)).toHaveLength(2)
  })

  it('restores a grouped source when an animated ancestor excludes it', () => {
    const scene = host()
    const { nodes, objects } = laidOut(WORTH_INSTANCING)
    const groups = createBatchedGroups(scene)
    groups.rebuild(nodes, id => objects.get(id))

    const parent = groupNodeFixture('parent')
    const middle = groupNodeFixture('middle', parent.id)
    const drivenNodes = [parent, middle, ...nodes.map(node => ({ ...node, parentId: middle.id }))]
    groups.rebuild(
      drivenNodes,
      id => objects.get(id),
      groupingExclusions(drivenNodes, new Set([parent.id])),
    )

    expect(scene.children).toHaveLength(0)
    expect([...objects.values()].every(mesh => mesh.layers.isEnabled(0))).toBe(true)
  })

  it('gives a shrunken group back to the camera, rather than leaving it invisible', () => {
    const scene = host()
    const groups = createBatchedGroups(scene)
    const { nodes, objects } = laidOut(WORTH_INSTANCING)
    groups.rebuild(nodes, id => objects.get(id))

    groups.rebuild(nodes.slice(0, 4), id => objects.get(id))
    for (const node of nodes.slice(0, 4)) {
      expect(objects.get(node.id)?.layers.isEnabled(0)).toBe(true)
    }
    expect(scene.children).toHaveLength(0)
  })

  it('takes its lots away when the engine goes', () => {
    const scene = host()
    const groups = createBatchedGroups(scene)
    const { nodes, objects } = laidOut(WORTH_INSTANCING)
    groups.rebuild(nodes, id => objects.get(id))

    groups.dispose()
    expect(scene.children).toHaveLength(0)
  })
})

describe('what a lot needs of three-mesh-bvh', () => {
  it('leaves both prototypes patched, the mesh one included', () => {
    // A `BatchedMesh` overrides `raycast`, so patching it alone still walks the whole buffer
    // under every instance: three-mesh-bvh's batched raycast calls `Mesh.prototype.raycast`,
    // and unpatched that one never reaches a tree. Measured: 0 tree walks, and a click on a
    // sphere came back with the faces of the boxes beside it.
    expect(Mesh.prototype.raycast).toBe(acceleratedRaycast)
    expect(BatchedMesh.prototype.raycast).toBe(acceleratedRaycast)
  })

  it('keeps a shape out of a lot once a second UV set is added to it in place', () => {
    const scene = host()
    const groups = createBatchedGroups(scene)
    const shared: Shape = { geometry: new BoxGeometry(1, 1, 1), descriptor: BOX.descriptor }
    const { nodes, objects } = laidOut(WORTH_INSTANCING * 2, at => (at % 2 === 0 ? shared : SPHERE))
    groups.rebuild(nodes, id => objects.get(id))
    expect(batchesIn(scene)).toHaveLength(1)

    // What an occlusion map does to a SHARED shape: `uv1` is added in place. Spelled from a
    // stale cache, the two shapes stay keyed together and `addGeometry` throws out of `apply`.
    const uv = shared.geometry.getAttribute('uv')
    shared.geometry.setAttribute('uv1', uv)

    expect(() => groups.rebuild(nodes, id => objects.get(id))).not.toThrow()
    expect(batchesIn(scene)).toHaveLength(2)
  })
})

describe('a node dragged while its lot draws it', () => {
  it('follows the mesh, without waiting for the gesture to end', () => {
    const scene = host()
    const groups = createBatchedGroups(scene)
    const { nodes, objects } = laidOut(WORTH_INSTANCING)
    groups.rebuild(nodes, id => objects.get(id))

    const mesh = objects.get('n0')
    if (!mesh) throw new Error('no mesh to drag')
    mesh.position.set(0, 9, 0)
    mesh.updateMatrixWorld(true)

    expect(groups.moved(['n0'], id => objects.get(id))).toBe(true)
    const placed = new Matrix4()
    onlyBatch(scene).getMatrixAt(0, placed)
    expect(placed.elements[13]).toBe(9)
  })

  it('grows the lot bounds rather than let a dragged node be culled out of them', () => {
    const scene = host()
    const groups = createBatchedGroups(scene)
    const { nodes, objects } = laidOut(WORTH_INSTANCING)
    groups.rebuild(nodes, id => objects.get(id))
    const before = onlyBatch(scene).boundingSphere?.radius ?? 0

    const mesh = objects.get('n0')
    if (!mesh) throw new Error('no mesh to drag')
    mesh.position.set(0, 500, 0)
    mesh.updateMatrixWorld(true)
    groups.moved(['n0'], id => objects.get(id))

    expect(onlyBatch(scene).boundingSphere?.radius ?? 0).toBeGreaterThan(before)
  })

  it('reaches as far for a shape three never measured as for one it did', () => {
    // A source sits on a layer the camera skips, so three never computes its bounds. Read as
    // zero, a dragged body grew the lot only to its CENTRE, and half a body stuck out of the
    // sphere the frustum tests — the lot could be culled with that body on screen.
    const reachAfterDrag = (measured: boolean): number => {
      const scene = host()
      const groups = createBatchedGroups(scene)
      const shape: Shape = { geometry: new BoxGeometry(1, 1, 1), descriptor: BOX.descriptor }
      const { nodes, objects } = laidOut(WORTH_INSTANCING, () => shape)
      groups.rebuild(nodes, id => objects.get(id))
      if (measured) shape.geometry.computeBoundingSphere()
      else shape.geometry.boundingSphere = null

      const mesh = objects.get('n0')
      if (!mesh) throw new Error('no mesh to drag')
      mesh.position.set(0, 500, 0)
      mesh.updateMatrixWorld(true)
      groups.moved(['n0'], id => objects.get(id))
      return onlyBatch(scene).boundingSphere?.radius ?? 0
    }

    expect(reachAfterDrag(false)).toBe(reachAfterDrag(true))
  })

  it('says nothing moved when no lot draws the node', () => {
    const scene = host()
    const groups = createBatchedGroups(scene)
    const { nodes, objects } = laidOut(WORTH_INSTANCING - 1)
    groups.rebuild(nodes, id => objects.get(id))

    expect(groups.moved(['n0'], id => objects.get(id))).toBe(false)
  })
})

describe('picking a body through the lot that draws it', () => {
  const built = (count: number, shapeOf?: (at: number) => Shape) => {
    const scene = host()
    const groups = createBatchedGroups(scene)
    const { nodes, objects } = laidOut(count, shapeOf)
    // Through `pickable`, which is what builds the trees the accelerated raycast walks.
    const pick = (at: number): string | null => {
      const hit = rayOnto(at).intersectObjects([...groups.pickable()], false)[0]
      return hit ? groups.nodeIdOf(hit) : null
    }
    return { groups, nodes, objects, pick }
  }

  it('answers the node the ray met, read off the field the raycast really sets', () => {
    const { groups, nodes, objects, pick } = built(WORTH_INSTANCING, at =>
      at % 2 === 0 ? BOX : SPHERE,
    )
    groups.rebuild(nodes, id => objects.get(id))

    expect(pick(5)).toBe('n5')
    expect(pick(6)).toBe('n6')
  })

  it('answers nothing for a hit on something no lot drew', () => {
    const { groups, nodes, objects } = built(WORTH_INSTANCING)
    groups.rebuild(nodes, id => objects.get(id))

    const stranger = new Mesh(BOX.geometry, RED.material)
    expect(groups.nodeIdOf({ object: stranger, distance: 1, point: new Vector3() })).toBeNull()
  })

  it('still answers the right node after one was added, removed, and put back', () => {
    const { groups, nodes, objects, pick } = built(WORTH_INSTANCING + 1)
    const settled = nodes.slice(0, WORTH_INSTANCING)
    groups.rebuild(settled, id => objects.get(id))
    expect(pick(7)).toBe('n7')

    groups.rebuild(nodes, id => objects.get(id))
    expect(pick(WORTH_INSTANCING)).toBe(`n${WORTH_INSTANCING}`)

    const without = nodes.filter(node => node.id !== 'n3')
    groups.rebuild(without, id => objects.get(id))
    expect(pick(3)).toBeNull()
    expect(pick(7)).toBe('n7')

    const restored = nodes[3]
    if (!restored) throw new Error('no node to restore')
    groups.rebuild([...without, restored], id => objects.get(id))
    expect(pick(3)).toBe('n3')
    expect(pick(7)).toBe('n7')
  })
})
