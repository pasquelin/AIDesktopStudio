import { BoxGeometry, Matrix4, Mesh, MeshStandardMaterial, Object3D, SphereGeometry } from 'three'
import { describe, expect, it } from 'vitest'
import {
  heldOutOfDraw,
  shapeAndPaint,
  sweep,
  unhang,
  worldReach,
  WORTH_INSTANCING,
} from './grouping'
import { markInstanceable, meshesOf } from './instanceableModel'
import { modelNodeFixture, walked } from './scene-fixtures'
import type { ModelDressRef } from '@shared/domain/scene'
import type { SceneNode } from './sceneState'

const bodyIn = (parent: Object3D): Mesh => {
  const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial())
  parent.add(mesh)
  return mesh
}

describe('holding the sources of a group out of the walk', () => {
  it('takes a source out of what a walk of the scene meets', () => {
    const scene = new Object3D()
    const mesh = bodyIn(scene)

    heldOutOfDraw().hold([mesh])

    expect(walked(scene)).not.toContain(mesh)
  })

  it('leaves it hanging from the node it belongs to, which is what answers upward', () => {
    const scene = new Object3D()
    const mesh = bodyIn(scene)

    heldOutOfDraw().hold([mesh])

    expect(mesh.parent).toBe(scene)
  })

  it('hangs it back where a walk meets it again', () => {
    const scene = new Object3D()
    const mesh = bodyIn(scene)
    const held = heldOutOfDraw()

    held.hold([mesh])
    held.hang()

    expect(walked(scene)).toContain(mesh)
  })

  it('hangs it once, however many times it is asked', () => {
    const scene = new Object3D()
    const mesh = bodyIn(scene)
    const held = heldOutOfDraw()

    held.hold([mesh])
    held.hang()
    held.hang()

    expect(scene.children.filter(child => child === mesh)).toHaveLength(1)
  })

  it('gives the previous set back when a rebuild settles on another one', () => {
    const scene = new Object3D()
    const first = bodyIn(scene)
    const second = bodyIn(scene)
    const held = heldOutOfDraw()

    held.hold([first])
    held.hold([second])

    expect(walked(scene)).toContain(first)
    expect(walked(scene)).not.toContain(second)
  })

  it('takes them out again after a caller has read the tree', () => {
    const scene = new Object3D()
    const mesh = bodyIn(scene)
    const held = heldOutOfDraw()

    held.hold([mesh])
    held.hang()
    held.drop()

    expect(walked(scene)).not.toContain(mesh)
  })

  it('leaves alone a source a gesture carried under the pivot', () => {
    const scene = new Object3D()
    const pivot = new Object3D()
    scene.add(pivot)
    const mesh = bodyIn(scene)
    const held = heldOutOfDraw()

    held.hold([mesh])
    pivot.attach(mesh)
    held.hang()

    expect(scene.children).not.toContain(mesh)
    expect(pivot.children.filter(child => child === mesh)).toHaveLength(1)
  })

  it('puts back nothing for a source released while it was out', () => {
    const scene = new Object3D()
    const mesh = bodyIn(scene)
    const held = heldOutOfDraw()

    held.hold([mesh])
    mesh.parent = null
    held.hang()

    expect(scene.children).not.toContain(mesh)
  })
})

describe('the world matrices no walk reaches any more', () => {
  it('are composed against the parent, as a walk of the scene would have', () => {
    const scene = new Object3D()
    const crate = new Object3D()
    scene.add(crate)
    const mesh = bodyIn(crate)
    mesh.position.set(2, 0, 0)
    const held = heldOutOfDraw()
    held.hold([mesh])

    crate.position.set(10, 0, 0)
    scene.updateMatrixWorld()
    held.refresh()

    expect(mesh.matrixWorld.elements[12]).toBe(12)
  })
})

describe('unhang', () => {
  it('keeps a released source from being hung back by the next rebuild', () => {
    const scene = new Object3D()
    const mesh = bodyIn(scene)
    const held = heldOutOfDraw()
    held.hold([mesh])

    unhang(mesh)
    held.hang()

    expect(scene.children).not.toContain(mesh)
    expect(mesh.parent).toBeNull()
  })
})

describe('how far a placed shape reaches', () => {
  it('never reads under what a SHEARED placement really stretches', () => {
    const stretched = new Object3D()
    stretched.scale.set(1, 1, 3)
    const turned = new Object3D()
    turned.rotation.set(0, Math.PI / 4, 0)
    stretched.add(turned)
    stretched.updateMatrixWorld(true)

    // A rotated child of a non-uniformly scaled parent stretches by 3; `getMaxScaleOnAxis`
    // measures the three columns and answers 2.236. A bound read off it culls what is on screen.
    expect(turned.matrixWorld.getMaxScaleOnAxis()).toBeCloseTo(2.236, 3)
    expect(worldReach(new SphereGeometry(1), turned.matrixWorld)).toBeGreaterThanOrEqual(3)
  })

  it('never reads under a shape whose mass sits OFF its own origin', () => {
    // A tube, a rail, a door leaf modelled beside its pivot: the sphere is centred where the mass
    // is, not where the node stands. Every caller lays the reach around the node's PLACEMENT.
    const aside = new BoxGeometry(1, 1, 1).translate(0, 5, 0)
    aside.computeBoundingSphere()
    const radius = aside.boundingSphere?.radius ?? 0

    // 🛑 Read off the radius alone, the box is five units too short and the body is REJECTED
    // while it is on screen — the one direction of error the whole partition exists to avoid.
    expect(radius).toBeLessThan(5)
    expect(worldReach(aside, new Matrix4())).toBeGreaterThanOrEqual(5 + radius)
  })

  it('costs a centred shape nothing, which is nearly every primitive of the studio', () => {
    const centred = new BoxGeometry(2, 2, 2)
    centred.computeBoundingSphere()

    // The norm is the Frobenius one, so an untransformed shape already reads ×√3 — the slack that
    // covered every decentred primitive measured, the tube included. Nothing here widens that.
    expect(worldReach(centred, new Matrix4())).toBeCloseTo(
      (centred.boundingSphere?.radius ?? 0) * Math.sqrt(3),
      6,
    )
  })
})

function glb(primitives: number, paint: string): Object3D {
  const root = new Object3D()
  for (let at = 0; at < primitives; at += 1) {
    root.add(new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ color: paint })))
  }
  markInstanceable(root, true)
  return root
}

describe('shapeAndPaint of a model', () => {
  const keyOf = shapeAndPaint()

  it('gives matching keys to the same primitive of two copies of one asset', () => {
    const node = modelNodeFixture('a', 'trees')
    const other = modelNodeFixture('b', 'trees')
    const first = glb(2, '#336633')
    const second = glb(2, '#336633')
    const [trunk, leaves] = meshesOf(first)
    const [trunkCopy, leavesCopy] = meshesOf(second)
    if (!trunk || !leaves || !trunkCopy || !leavesCopy) throw new Error('expected two primitives')

    expect(keyOf(node, trunk)).toBe(keyOf(other, trunkCopy))
    expect(keyOf(node, leaves)).toBe(keyOf(other, leavesCopy))
    expect(keyOf(node, trunk)).not.toBe(keyOf(node, leaves))
  })

  it('gives distinct keys to two assets, and to two dresses', () => {
    const oak = modelNodeFixture('a', 'oak')
    const pine = modelNodeFixture('b', 'pine')
    const tree = glb(1, '#336633')
    const [mesh] = meshesOf(tree)
    if (!mesh) throw new Error('expected a primitive')

    expect(keyOf(oak, mesh)).not.toBe(keyOf(pine, mesh))

    const imageDress: ModelDressRef = { kind: 'image', assetId: 'pic-1' }
    const paintDress: ModelDressRef = { kind: 'materials', documentIds: ['mat-1'] }
    const inImage = { ...oak, model: { ...oak.model, dress: imageDress } }
    const inPaint = { ...oak, model: { ...oak.model, dress: paintDress } }
    expect(keyOf(inImage, mesh)).not.toBe(keyOf(inPaint, mesh))
    expect(keyOf(inImage, mesh)).not.toBe(keyOf(oak, mesh))
  })
})

function modelCopies(count: number, primitives: number) {
  const nodes: SceneNode[] = []
  const objects = new Map<string, Object3D>()
  const shapes = [new BoxGeometry(1, 1, 1), new BoxGeometry(0.4, 2, 0.4)]
  const paints = [new MeshStandardMaterial(), new MeshStandardMaterial({ color: '#226622' })]
  for (let at = 0; at < count; at += 1) {
    const node = modelNodeFixture(`m${at}`, 'tree')
    const holder = new Object3D()
    holder.position.set(at, 0, 0)
    for (let primitive = 0; primitive < primitives; primitive += 1) {
      const mesh = new Mesh(shapes[primitive], paints[primitive])
      if (primitive === 1) mesh.position.set(0, 1.5, 0)
      holder.add(mesh)
    }
    holder.updateMatrixWorld(true)
    markInstanceable(holder, true)
    nodes.push(node)
    objects.set(node.id, holder)
  }
  return { nodes, objects }
}

describe('sweep of an instanceable model', () => {
  it('places two primitives of one node into two groups, sharing the node id', () => {
    const host = new Object3D()
    const { nodes, objects } = modelCopies(WORTH_INSTANCING, 2)
    for (const holder of objects.values()) host.add(holder)
    const groups = sweep(
      nodes,
      id => objects.get(id),
      host,
      mesh => mesh.material,
      shapeAndPaint(),
      heldOutOfDraw(),
    )

    expect(groups).toHaveLength(2)
    expect(groups.map(group => group.ids.length)).toEqual([WORTH_INSTANCING, WORTH_INSTANCING])
    expect(groups[0]?.ids[0]).toBe(groups[1]?.ids[0])
    expect(groups[0]?.meshes[0]).not.toBe(groups[1]?.meshes[0])
  })

  it('writes each primitive at its own world pose, not the holder origin', () => {
    const host = new Object3D()
    const { nodes, objects } = modelCopies(WORTH_INSTANCING, 2)
    for (const holder of objects.values()) host.add(holder)
    const groups = sweep(
      nodes,
      id => objects.get(id),
      host,
      mesh => mesh.material,
      shapeAndPaint(),
      heldOutOfDraw(),
    )
    const trunk = groups.find(group => (group.meshes[0]?.position.y ?? -1) === 0)
    const crown = groups.find(group => (group.meshes[0]?.position.y ?? 0) === 1.5)
    expect(trunk?.meshes[0]?.matrixWorld.elements[12]).toBe(0)
    expect(crown?.meshes[0]?.matrixWorld.elements[13]).toBe(1.5)
  })
})
