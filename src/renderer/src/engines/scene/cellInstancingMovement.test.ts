import { BoxGeometry, Group, InstancedMesh, Mesh, MeshStandardMaterial, Object3D } from 'three'
import { PerspectiveCamera } from 'three'
import { describe, expect, it } from 'vitest'
import { meshNode, walked } from './scene-fixtures'
import { isDrawn, WORTH_INSTANCING } from './grouping'
import { createCellGroups } from './cellInstancing'
import { CELL_SIZE } from './worldPartition'
import type { Component } from '@shared/domain/component'
import type { MeshNode, SceneNode } from './sceneState'

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

/** What a body says of itself when a system drives it — the declared path. */
const MOVES: Component = { type: 'Movement' }

/** A second spelling, so a body can change GROUP without ceasing to declare that it moves. */
const OTHER_SHAPE: MeshNode['geometry'] = { kind: 'box', width: 2, height: 2, depth: 2 }

const host = (): Object3D => new Object3D()

const cellsIn = (scene: Object3D): Group[] => scene.children.filter(child => child instanceof Group)

const instancesIn = (scene: Object3D): InstancedMesh[] =>
  walked(scene).filter(child => child instanceof InstancedMesh)

/* Two cells a level apart, already built — what both the zone and a rebuild are read on. */
const twoCells = (): {
  scene: Object3D
  groups: ReturnType<typeof createCellGroups>
  nodes: SceneNode[]
  objects: Map<string, Mesh>
} => {
  const scene = host()
  const { nodes, objects } = bodies([
    ...inOneCell(WORTH_INSTANCING, 0),
    ...inOneCell(WORTH_INSTANCING, 20 * CELL_SIZE),
  ])
  const groups = createCellGroups(scene)
  groups.rebuild(nodes, id => objects.get(id))
  return { scene, groups, nodes, objects }
}

/** What three would really draw: the instance visible, and every group it hangs from with it. */
const drawnIn = (scene: Object3D): InstancedMesh[] =>
  instancesIn(scene).filter(mesh => isDrawn(mesh, scene))

/* Where each cell the scene still holds stands, along x — one number per cell, sorted. */
/** A view of `far` from where it stands, aimed along `at` — what decides what is drawn. */
function looking(
  x: number,
  far: number,
  at: { x: number; z: number } = { x: 1, z: 0 },
): PerspectiveCamera {
  const camera = new PerspectiveCamera(50, 1, 0.1, far)
  camera.position.set(x, 0, 0)
  camera.lookAt(x + at.x, 0, at.z)
  camera.updateMatrixWorld(true)
  camera.updateProjectionMatrix()
  return camera
}

describe('a body dragged into view', () => {
  it('brings its whole cell back with it, without any rebuild', () => {
    const scene = host()
    const shape = new BoxGeometry(1, 1, 1)
    // Off to the side of a view aimed along x: the cell is standing and drawn by nobody.
    const { nodes, objects } = bodies(inOneCell(WORTH_INSTANCING, 20), shape, 200)
    const groups = createCellGroups(scene)
    groups.rebuild(nodes, id => objects.get(id))
    groups.follow?.(looking(0, 500))
    expect(drawnIn(scene)).toHaveLength(0)

    // A drag reports through `moved` alone — a body keeps its cell until a change of CONTENT.
    const dragged = objects.get('n0')
    if (!dragged) throw new Error('no body to drag')
    dragged.position.set(20, 0, 0)
    dragged.updateMatrixWorld(true)
    groups.moved(['n0'], id => objects.get(id))
    groups.follow?.(looking(0, 500))

    // The cell's box is the union of its lots'. Grown on the lot alone, the cell stayed where its
    // bodies STOOD and took the dragged one off screen with it, for the length of the gesture.
    expect(drawnIn(scene)).toHaveLength(1)
  })
})

describe('what the strategy publishes of its own index', () => {
  it('says what the last query walked, and what the scene now holds', () => {
    const { groups } = twoCells()

    groups.follow?.(looking(0, 500))

    // Nothing in the studio could see this before: the count lived in the spike alone.
    expect(groups.stats?.()).toMatchObject({ cells: 2, cellsStanding: 1, cellsReturned: 1 })
    expect(groups.stats?.().nodesVisited).toBeGreaterThan(0)
  })
})

describe('a rebuild after a change of content', () => {
  it('keeps the cells nothing touched, and builds again only the one that changed', () => {
    const { groups, nodes, objects } = twoCells()
    const [near, far] = groups.drawn()

    // One body deleted from the far cell. The near one holds the same bodies in the same slots.
    groups.rebuild(nodes.slice(0, -1), id => objects.get(id))

    const now = groups.drawn()
    expect(now).toContain(near)
    expect(now).not.toContain(far)
  })

  it('draws for one body fewer once it is gone', () => {
    const { groups, nodes, objects } = twoCells()

    groups.rebuild(nodes.slice(0, -1), id => objects.get(id))

    const counts = groups.drawn().map(mesh => (mesh instanceof InstancedMesh ? mesh.count : 0))
    expect(counts.toSorted()).toEqual([WORTH_INSTANCING - 1, WORTH_INSTANCING])
  })

  it('forgets a cell nothing stands in any more', () => {
    const { scene, groups, nodes, objects } = twoCells()

    groups.rebuild(nodes.slice(0, WORTH_INSTANCING), id => objects.get(id))

    expect(cellsIn(scene)).toHaveLength(1)
  })

  it('rebuilds nothing at all when nothing moved', () => {
    const { groups, nodes, objects } = twoCells()
    const held = groups.drawn()

    groups.rebuild(nodes, id => objects.get(id))

    expect(groups.drawn()).toEqual(held)
  })

  it('writes the matrix of a body carried elsewhere inside its own cell', () => {
    const { groups, nodes, objects } = twoCells()
    const mesh = objects.get('n0')
    if (!mesh) throw new Error('no body to carry')

    mesh.position.set(0, 7, 0)
    mesh.updateMatrixWorld(true)
    groups.rebuild(nodes, id => objects.get(id))

    // The cell holds the same bodies in the same slots, so nothing structural says it changed —
    // and a rebuild that trusted that would leave the body where it stood.
    const instance = groups.drawn()[0]
    expect(instance instanceof InstancedMesh && instance.instanceMatrix.array[13]).toBe(7)
  })
})

describe('a body that DECLARES it moves', () => {
  const declared = (): {
    scene: Object3D
    groups: ReturnType<typeof createCellGroups>
    nodes: SceneNode[]
    objects: Map<string, Mesh>
  } => {
    const scene = host()
    const { nodes, objects } = bodies(inOneCell(WORTH_INSTANCING, 0))
    const said = nodes.map(node => (node.id === 'n2' ? { ...node, components: [MOVES] } : node))
    const groups = createCellGroups(scene)
    groups.rebuild(said, id => objects.get(id))
    return { scene, groups, nodes: said, objects }
  }

  const moverLot = (scene: Object3D): InstancedMesh | undefined =>
    scene.children.find(child => child instanceof InstancedMesh)

  it('is never put in a cell in the first place', () => {
    const { scene, groups } = declared()

    // 🛑 Déclaré, pas déduit : le document dit ce qu'un corps fait, et le premier mouvement n'a
    // plus rien à promouvoir. Une cellule n'est donc jamais défaite pour lui.
    expect(moverLot(scene)?.count).toBe(1)
    const cell = groups.drawn()[0]
    expect(cell instanceof InstancedMesh && cell.count).toBe(WORTH_INSTANCING - 1)
  })

  it('costs nothing to move, since there is nothing left to promote', () => {
    const { scene, groups, objects } = declared()
    const cell = groups.drawn()[0]
    const mesh = objects.get('n2')
    if (!mesh) throw new Error('no body to move')
    mesh.position.set(0, 5, 0)
    mesh.updateMatrixWorld(true)

    groups.moved(['n2'], id => objects.get(id))

    expect(groups.drawn()).toContain(cell)
    expect(moverLot(scene)?.instanceMatrix.array[13]).toBe(5)
  })

  it('keeps its slot across a change of content', () => {
    const { scene, groups, nodes, objects } = declared()

    groups.rebuild(nodes, id => objects.get(id))

    expect(moverLot(scene)?.count).toBe(1)
  })

  it('is drawn ONCE when it changes group without stopping to declare it', () => {
    // TWO groups, each above the floor once the mover has moved across: a group of one is never
    // instanced at all, and the case would not be exercised.
    const scene = host()
    const one = bodies(inOneCell(WORTH_INSTANCING + 1, 0), new BoxGeometry(1, 1, 1), 0, 'a')
    const two = bodies(inOneCell(WORTH_INSTANCING - 1, 40), new BoxGeometry(2, 2, 2), 0, 'b')
    const objects = new Map([...one.objects, ...two.objects])
    const nodes = [
      ...one.nodes.map(node => (node.id === 'a2' ? { ...node, components: [MOVES] } : node)),
      ...two.nodes.map(node => ({ ...node, geometry: OTHER_SHAPE })),
    ]
    const groups = createCellGroups(scene)
    groups.rebuild(nodes, id => objects.get(id))

    const moved = objects.get('a2')
    if (!moved) throw new Error('no body to repaint')
    moved.geometry = two.objects.get('b0')?.geometry ?? moved.geometry
    groups.rebuild(
      nodes.map(node => (node.id === 'a2' ? { ...node, geometry: OTHER_SHAPE } : node)),
      id => objects.get(id),
    )

    // 🛑 Its old lot has to let go of it. Checking only « was it seen at all » left it drawn by
    // both lots, in two shapes, for as long as it kept declaring that it moves.
    const held = scene.children.filter(child => child instanceof InstancedMesh)
    expect(held.reduce((sum, lot) => sum + lot.count, 0)).toBe(1)
  })

  it('takes the paint of the PASS, not the one the lot was born with', () => {
    const scene = host()
    const { nodes, objects } = bodies(inOneCell(WORTH_INSTANCING, 0))
    const said = nodes.map(node => (node.id === 'n2' ? { ...node, components: [MOVES] } : node))
    const groups = createCellGroups(scene)
    groups.rebuild(said, id => objects.get(id))
    const born = scene.children.find(child => child instanceof InstancedMesh)?.material

    // The body the paint came from is deleted; the studio disposes that material. The lot is
    // KEPT across the rebuild, so it would go on drawing with what no longer exists.
    const repainted = new MeshStandardMaterial()
    for (const mesh of objects.values()) mesh.material = repainted
    groups.rebuild(said, id => objects.get(id))

    expect(born).not.toBe(repainted)
    expect(scene.children.find(child => child instanceof InstancedMesh)?.material).toBe(repainted)
  })

  it('takes the emptied lot out of the scene, rather than leaving it drawn for nobody', () => {
    const scene = host()
    const one = bodies(inOneCell(WORTH_INSTANCING + 1, 0), new BoxGeometry(1, 1, 1), 0, 'a')
    const two = bodies(inOneCell(WORTH_INSTANCING - 1, 40), new BoxGeometry(2, 2, 2), 0, 'b')
    const objects = new Map([...one.objects, ...two.objects])
    const nodes = [
      ...one.nodes.map(node => (node.id === 'a2' ? { ...node, components: [MOVES] } : node)),
      ...two.nodes.map(node => ({ ...node, geometry: OTHER_SHAPE })),
    ]
    const groups = createCellGroups(scene)
    groups.rebuild(nodes, id => objects.get(id))
    const emptied = scene.children.filter(child => child instanceof InstancedMesh)
    expect(emptied).toHaveLength(1)

    // The only mover of its group changes shape, so it answers to ANOTHER lot from now on.
    const moved = objects.get('a2')
    if (!moved) throw new Error('no body to reshape')
    moved.geometry = two.objects.get('b0')?.geometry ?? moved.geometry
    groups.rebuild(
      nodes.map(node => (node.id === 'a2' ? { ...node, geometry: OTHER_SHAPE } : node)),
      id => objects.get(id),
    )

    // 🛑 Emptied is not gone: the lot stayed hung from the host, listed by `drawn()` — so walked
    // by every dress of every pane, every frame — with its instance buffer still on the GPU. One
    // edit of a material on a mover leaked one, and only closing the document gave it back.
    for (const lot of emptied) expect(scene.children).not.toContain(lot)
    expect(groups.drawn()).not.toContain(emptied[0])
  })

  it('goes back to the grid once it stops declaring it', () => {
    const { scene, groups, nodes, objects } = declared()

    groups.rebuild(
      nodes.map(node => ({ ...node, components: [] })),
      id => objects.get(id),
    )

    expect(moverLot(scene)).toBeUndefined()
    const cell = groups.drawn().find(mesh => mesh instanceof InstancedMesh && mesh.count > 1)
    expect(cell instanceof InstancedMesh && cell.count).toBe(WORTH_INSTANCING)
  })
})
