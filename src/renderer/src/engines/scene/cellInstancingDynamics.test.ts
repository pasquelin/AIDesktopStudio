import {
  BoxGeometry,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Raycaster,
  Vector3,
} from 'three'
import { describe, expect, it } from 'vitest'
import { meshNode, walked } from './scene-fixtures'
import { WORTH_INSTANCING } from './grouping'
import { createCellGroups } from './cellInstancing'
import type { Component } from '@shared/domain/component'
import type { SceneNode } from './sceneState'

/** Bodies of one shape, laid out by the caller — which is the whole of what a cell is decided by. */
function bodies(
  places: readonly number[],
  geometry: BoxGeometry = new BoxGeometry(1, 1, 1),
  z = 0,
  named = 'n',
): { nodes: SceneNode[]; objects: Map<string, Mesh> } {
  const nodes: SceneNode[] = []
  const objects = new Map<string, Mesh>()
  const material = new MeshStandardMaterial()

  for (const [at, x] of places.entries()) {
    const node = meshNode(`${named}${at}`)
    const mesh = new Mesh(geometry, material)
    mesh.position.set(x, 0, z)
    mesh.updateMatrixWorld(true)
    nodes.push(node)
    objects.set(node.id, mesh)
  }
  return { nodes, objects }
}

/*
 * One lot over TWO cells of the same zone: one ahead of the camera, one beside it. The shape and
 * the paint are shared, so the two are one group cut in two by the grid — the case the box is for.
 */
/** `count` bodies inside one cell, around `x`. */
const inOneCell = (count: number, x: number): number[] =>
  Array.from({ length: count }, (_unused, at) => x + at)

/* What a body says of itself when a system drives it — the declared path. */
/* A second spelling, so a body can change GROUP without ceasing to declare that it moves. */
const host = (): Object3D => new Object3D()

const instancesIn = (scene: Object3D): InstancedMesh[] =>
  walked(scene).filter(child => child instanceof InstancedMesh)

/* Two cells a level apart, already built — what both the zone and a rebuild are read on. */
/* What three would really draw: the instance visible, and every group it hangs from with it. */
/* Where each cell the scene still holds stands, along x — one number per cell, sorted. */
/** A view of `far` from where it stands, aimed along `at` — what decides what is drawn. */
describe('a body that moves without declaring it', () => {
  const moving = (): {
    scene: Object3D
    groups: ReturnType<typeof createCellGroups>
    objects: Map<string, Mesh>
    nodes: SceneNode[]
    cell: InstancedMesh
  } => {
    const scene = host()
    const { nodes, objects } = bodies(inOneCell(WORTH_INSTANCING, 0))
    const groups = createCellGroups(scene)
    groups.rebuild(nodes, id => objects.get(id))
    const cell = groups.drawn()[0]
    if (!(cell instanceof InstancedMesh)) throw new Error('the cell was never built')
    return { scene, groups, objects, nodes, cell }
  }

  const shove = (
    groups: ReturnType<typeof createCellGroups>,
    objects: Map<string, Mesh>,
    id: string,
    y: number,
  ): boolean => {
    const mesh = objects.get(id)
    if (!mesh) throw new Error(`no body ${id}`)
    mesh.position.set(0, y, 0)
    mesh.updateMatrixWorld(true)
    return groups.moved([id], held => objects.get(held))
  }

  /** The lot of movers: hung from the host, and the only mesh outside every cell group. */
  const moverLot = (scene: Object3D): InstancedMesh | undefined =>
    scene.children.find(child => child instanceof InstancedMesh)

  it('leaves the grid for a lot of its own, without rebuilding its cell', () => {
    const { scene, groups, objects, cell } = moving()

    expect(shove(groups, objects, 'n2', 3)).toBe(true)

    // The SAME cell object, one body lighter — no rebuild — and the mover drawn beside it.
    expect(groups.drawn()).toContain(cell)
    expect(cell.count).toBe(WORTH_INSTANCING - 1)
    expect(moverLot(scene)?.count).toBe(1)
  })

  it('is written where it now stands', () => {
    const { scene, groups, objects } = moving()

    shove(groups, objects, 'n2', 3)

    expect(moverLot(scene)?.instanceMatrix.array[13]).toBe(3)
  })

  it('fills the hole it left with the LAST body, rather than shifting the rest', () => {
    const { groups, objects, cell } = moving()

    shove(groups, objects, 'n2', 3)

    // A splice would move every matrix after the hole — the whole cost the layer exists to
    // avoid. `n15` stood at x = 15; it now stands in the slot `n2` left.
    expect(cell.instanceMatrix.array[2 * 16 + 12]).toBe(WORTH_INSTANCING - 1)
  })

  it('keeps its slot for life, and pays nothing on the moves after the first', () => {
    const { scene, groups, objects, cell } = moving()
    shove(groups, objects, 'n2', 3)

    shove(groups, objects, 'n2', 7)
    shove(groups, objects, 'n2', 9)

    expect(cell.count).toBe(WORTH_INSTANCING - 1)
    expect(moverLot(scene)?.count).toBe(1)
    expect(moverLot(scene)?.instanceMatrix.array[13]).toBe(9)
  })

  it('is never culled, since a sphere measured once is wrong at its first step', () => {
    const { scene, groups, objects } = moving()

    shove(groups, objects, 'n2', 3)

    expect(moverLot(scene)?.frustumCulled).toBe(false)
  })

  it('stays off the grid when the content changes around it', () => {
    const { scene, groups, objects, nodes, cell } = moving()
    shove(groups, objects, 'n2', 3)

    groups.rebuild(nodes, id => objects.get(id))

    // A change of content must not put a mover back in a cell: that would rebuild the cell for
    // it, on every change, which is exactly what the layer exists to stop.
    expect(moverLot(scene)?.count).toBe(1)
    expect(groups.drawn()).toContain(cell)
  })

  it('leaves its lot when the document no longer holds it', () => {
    const { scene, groups, objects, nodes } = moving()
    shove(groups, objects, 'n2', 3)

    groups.rebuild(
      nodes.filter(node => node.id !== 'n2'),
      id => objects.get(id),
    )

    // Emptied AND given back: a lot nobody is on leaves the scene and the GPU with it.
    expect(moverLot(scene)).toBeUndefined()
  })
})

describe('a lot whose bodies travel past the sphere three cached', () => {
  /** What a body says of itself when a system drives it — the declared path. */
  const MOVES: Component = { type: 'Movement' }

  const raysAt = (from: number): Raycaster =>
    new Raycaster(new Vector3(from, 10, 0), new Vector3(0, -1, 0))

  it('stays clickable once a rebuild carries it past the sphere a ray cached', () => {
    const scene = host()
    const { nodes, objects } = bodies(inOneCell(WORTH_INSTANCING, 0))
    const declared = nodes.map(node => ({ ...node, components: [MOVES] }))
    const groups = createCellGroups(scene)
    groups.rebuild(declared, id => objects.get(id))
    // 🛑 The FIRST ray is what freezes the sphere: three computes it once and never invalidates it.
    raysAt(2).intersectObjects([...(groups.pickable?.() ?? [])])

    const travelled = objects.get('n2')
    if (!travelled) throw new Error('no body to move')
    travelled.position.set(400, 0, 0)
    travelled.updateMatrixWorld(true)
    groups.rebuild(declared, id => objects.get(id))

    const hit = raysAt(400).intersectObjects([...(groups.pickable?.() ?? [])])[0]
    expect(hit && groups.nodeIdOf?.(hit)).toBe('n2')
  })

  it('stays clickable when a body JOINS the lot beyond that sphere', () => {
    const scene = host()
    const { nodes, objects } = bodies(inOneCell(WORTH_INSTANCING + 1, 0))
    const declared = nodes.map(node => ({ ...node, components: [MOVES] }))
    const groups = createCellGroups(scene)
    const arriving = declared.at(-1)
    if (!arriving) throw new Error('no body to bring in')
    groups.rebuild(
      declared.filter(node => node !== arriving),
      id => objects.get(id),
    )
    raysAt(2).intersectObjects([...(groups.pickable?.() ?? [])])

    objects.get(arriving.id)?.position.set(400, 0, 0)
    objects.get(arriving.id)?.updateMatrixWorld(true)
    groups.rebuild(declared, id => objects.get(id))

    const hit = raysAt(400).intersectObjects([...(groups.pickable?.() ?? [])])[0]
    expect(hit && groups.nodeIdOf?.(hit)).toBe(arriving.id)
  })
})

describe('disposing the groups', () => {
  const settled = (): {
    scene: Object3D
    groups: ReturnType<typeof createCellGroups>
    objects: Map<string, Mesh>
  } => {
    const scene = host()
    const { nodes, objects } = bodies(inOneCell(WORTH_INSTANCING, 0))
    for (const mesh of objects.values()) scene.add(mesh)
    const groups = createCellGroups(scene)
    groups.rebuild(nodes, id => objects.get(id))
    return { scene, groups, objects }
  }

  it('takes its meshes out of the scene and gives the sources back to the walk', () => {
    const { scene, groups, objects } = settled()

    groups.dispose()

    expect(instancesIn(scene)).toHaveLength(0)
    expect(walked(scene)).toContain(objects.get('n0'))
  })

  it('takes the lots of the MOVERS with them, which no bucket names', () => {
    const { scene, groups, objects } = settled()
    const mover = objects.get('n2')
    if (!mover) throw new Error('no body to move')
    mover.position.set(0, 3, 0)
    mover.updateMatrixWorld(true)
    groups.moved(['n2'], id => objects.get(id))

    groups.dispose()

    // A lot of movers hangs from the host and belongs to no cell: a teardown that walked the
    // cells alone left its instance buffer on the GPU and its mesh in the scene.
    expect(instancesIn(scene)).toHaveLength(0)
  })
})

describe('a lot of movers born while a pane wears a stand-in', () => {
  /**
   * What a display mode does to what is already drawn: `dressForPane` replaces the material of
   * every mesh it walks, and remembers the real one — but only for a mesh that HAD it.
   */
  const dressed = (scene: Object3D, stand: MeshStandardMaterial): void => {
    for (const mesh of instancesIn(scene)) mesh.material = stand
  }

  const moverLot = (scene: Object3D): InstancedMesh | undefined =>
    scene.children.find(child => child instanceof InstancedMesh)

  it('wears the material of the DOCUMENT, never the stand-in the cell was wearing', () => {
    const scene = host()
    const { nodes, objects } = bodies(inOneCell(WORTH_INSTANCING, 0))
    const groups = createCellGroups(scene, mesh => own.get(mesh) ?? mesh.material)
    // What `SceneRenderer` hands the strategy: the material the DOCUMENT dresses a mesh in, which
    // a pane in a solid view has already replaced on the mesh itself.
    const own = new Map<Mesh, MeshStandardMaterial>()
    const paint = objects.get('n0')?.material
    if (!(paint instanceof MeshStandardMaterial)) throw new Error('no paint to remember')
    groups.rebuild(nodes, id => objects.get(id))

    const stand = new MeshStandardMaterial()
    dressed(scene, stand)
    for (const mesh of objects.values()) {
      own.set(mesh, paint)
      mesh.material = stand
    }

    const mover = objects.get('n2')
    if (!mover) throw new Error('no body to move')
    mover.position.set(0, 3, 0)
    mover.updateMatrixWorld(true)
    groups.moved(['n2'], id => objects.get(id))

    // 🛑 Born wearing the stand-in, the lot has nothing for `paneMemory` to give back: going
    // back to a shaded view leaves the mover painted, and only a full rebuild undoes it.
    expect(moverLot(scene)?.material).toBe(paint)
  })

  it('says it built something, so the next pane dresses what it made', () => {
    const scene = host()
    const { nodes, objects } = bodies(inOneCell(WORTH_INSTANCING, 0))
    const groups = createCellGroups(scene)
    groups.rebuild(nodes, id => objects.get(id))
    // The rebuild's own lots are already answered for: the question is what a MOVE makes.
    groups.builtAnew?.()

    const mover = objects.get('n2')
    if (!mover) throw new Error('no body to move')
    mover.position.set(0, 3, 0)
    mover.updateMatrixWorld(true)
    groups.moved(['n2'], id => objects.get(id))

    expect(groups.builtAnew?.()).toBe(true)
    // Asked and answered: a pane that has already dressed what was made must not redress on
    // every frame of a drag.
    expect(groups.builtAnew?.()).toBe(false)
  })
})
