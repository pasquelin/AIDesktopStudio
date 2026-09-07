import { BatchedMesh, Box3, Group, InstancedMesh, Matrix4, Object3D, Vector3 } from 'three'
import { byCodeUnit } from '@shared/text'
import { DEFAULT_SETTINGS } from '@shared/domain/settings'
import { describe, expect, it } from 'vitest'
import { SceneRenderer, type GroupingStrategy, type PartitionMode } from './SceneRenderer'
import { directionalLight, gltfNodesOf, groupNodeFixture, meshNode, walked } from './scene-fixtures'
import { WORTH_INSTANCING } from './grouping'
import type { GeometryDescriptor } from '@shared/domain/geometry'
import { EMPTY_SCENE, type MeshNode, type SceneNode, type SceneState } from './sceneState'

/** External behavior required from bodies rendered through instancing. */

const STRATEGIES: GroupingStrategy[] = ['instanced', 'batched']

/** How the engine can be told to draw repeated shapes. The third names nothing: it IS the default. */
const DRAWINGS: [string, Drawing][] = [
  ['instanced', { grouping: 'instanced' }],
  ['batched', { grouping: 'batched' }],
  ['partitioned', {}],
]

type Drawing = {
  grouping?: GroupingStrategy
  partition?: PartitionMode
  optimization?: 'auto' | 'off'
}

const GROUP_SIZES = [4, 12, 20, 45, 60]

function bodies(): MeshNode[] {
  const nodes: MeshNode[] = []
  let at = 0
  for (const [group, size] of GROUP_SIZES.entries()) {
    for (let copy = 0; copy < size; copy++) {
      const node = meshNode(`g${group}_${copy}`)
      nodes.push({
        ...node,
        geometry:
          copy % 2 === 0
            ? node.geometry
            : { kind: 'sphere', radius: 0.5, widthSegments: 8, heightSegments: 6 },
        material: { ...node.material, roughness: 0.1 * group, color: `#00${group}${group}ff` },
        transform: { ...node.transform, position: { x: at * 2, y: 0, z: group * 3 } },
      })
      at++
    }
  }
  return nodes
}

const sceneOf = (nodes: SceneNode[]): SceneState => ({
  ...EMPTY_SCENE,
  nodes: [directionalLight('sun'), ...nodes],
})

const graphOf = (renderer: SceneRenderer): Object3D =>
  (renderer as unknown as { viewport: { scene: Object3D } }).viewport.scene

/** Finds a slot through partition groups and returns its x position. */
const placedAt = (renderer: SceneRenderer, slot: number): number => {
  const held = new Matrix4()
  for (const child of walked(graphOf(renderer))) {
    if (child instanceof InstancedMesh) child.getMatrixAt(slot, held)
    else if (child instanceof BatchedMesh) child.getMatrixAt(slot, held)
    else continue
    return held.elements[12] ?? 0
  }
  throw new Error('nothing was grouped')
}

const rendererOf = (drawing: Drawing = { grouping: 'batched' }): SceneRenderer =>
  new SceneRenderer({
    onSelect: () => {},
    onTransform: () => {},
    ...drawing,
    loadModel: async () => new Group(),
  })

const fileOf = async (renderer: SceneRenderer): Promise<string> =>
  new TextDecoder().decode(await renderer.exportTo('gltf', 'scene'))

const namesOf = async (renderer: SceneRenderer): Promise<string[]> =>
  (await gltfNodesOf(renderer)).flatMap(node => node.name ?? [])

describe('editing a body a lot draws', () => {
  it('keeps every source individually drawn when SAFE validation disables optimization', () => {
    const nodes = bodies()
    const renderer = rendererOf({ optimization: 'off' })
    renderer.apply(sceneOf(nodes))

    const graph = walked(graphOf(renderer))
    for (const node of nodes) expect(graph.map(object => object.name)).toContain(node.id)
    expect(
      graph.some(object => object instanceof InstancedMesh || object instanceof BatchedMesh),
    ).toBe(false)
  })

  it('keeps logical identity beside the picking observations of rendered cameras', () => {
    const nodes = bodies()
    const renderer = rendererOf()
    renderer.apply(sceneOf(nodes))

    expect(renderer.runtimeValidationSnapshot().picking).toEqual({
      logical: expect.arrayContaining(
        nodes.map(node => ({ sourceId: node.id, runtimeId: node.id })),
      ),
      rendered: [],
    })
  })

  it('exports the scene with every body, whatever draws it', async () => {
    const nodes = bodies()
    const renderer = rendererOf()
    renderer.apply(sceneOf(nodes))

    const names = await namesOf(renderer)
    for (const node of nodes) expect(names).toContain(node.id)
  })

  it('exports the same file as the instanced path, since the sources are what is exported', async () => {
    const nodes = bodies()
    const batched = rendererOf({ grouping: 'batched' })
    batched.apply(sceneOf(nodes))
    const instanced = rendererOf({ grouping: 'instanced' })
    instanced.apply(sceneOf(nodes))

    expect(await fileOf(batched)).toEqual(await fileOf(instanced))
  })

  it('lands on the same graph whether a body moved then came back, or never moved', async () => {
    const nodes = bodies()
    const settled = sceneOf(nodes)
    const moved = sceneOf(
      nodes.map(node =>
        node.id === 'g4_3'
          ? { ...node, transform: { ...node.transform, position: { x: 900, y: 5, z: 5 } } }
          : node,
      ),
    )

    const edited = rendererOf()
    edited.apply(settled)
    edited.apply(moved)
    edited.apply(settled)

    const straight = rendererOf()
    straight.apply(settled)

    expect(await fileOf(edited)).toEqual(await fileOf(straight))
  })

  it('holds every body again once a removed one is restored', async () => {
    const nodes = bodies()
    const settled = sceneOf(nodes)
    const without = sceneOf(nodes.filter(node => node.id !== 'g4_3'))

    const edited = rendererOf()
    edited.apply(settled)
    edited.apply(without)
    edited.apply(settled)

    const straight = rendererOf()
    straight.apply(settled)

    expect((await namesOf(edited)).sort(byCodeUnit)).toEqual(
      (await namesOf(straight)).sort(byCodeUnit),
    )
  })
})

describe.each(STRATEGIES)('the copy a %s group draws', grouping => {
  const inARow = (count: number): SceneNode[] =>
    Array.from({ length: count }, (_unused, at) => ({
      ...meshNode(`r${at}`),
      transform: {
        position: { x: at * 5, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
    }))

  /** No directional light: grouping must refresh world matrices without the shadow pass. */
  it('stands where its node does, in a scene no light refreshes', () => {
    const nodes = inARow(WORTH_INSTANCING)
    const renderer = rendererOf({ grouping })
    renderer.apply({ ...EMPTY_SCENE, nodes })

    expect(placedAt(renderer, 3)).toBe(15)
  })

  it('follows the parent it hangs from, which moved without it', () => {
    const nodes: SceneNode[] = [
      // A paint of its own, so the crate is a group of one and falls under the floor: a lot keys
      // on the MATERIAL, and a crate sharing it would take a slot in the very lot being read.
      {
        ...meshNode('crate'),
        material: { ...meshNode('crate').material, color: '#123456' },
      },
      ...inARow(WORTH_INSTANCING).map(node => ({ ...node, parentId: 'crate' })),
    ]
    const renderer = rendererOf({ grouping })
    renderer.apply({ ...EMPTY_SCENE, nodes })

    const moved = nodes.map(node =>
      node.id === 'crate'
        ? { ...node, transform: { ...node.transform, position: { x: 100, y: 0, z: 0 } } }
        : node,
    )
    renderer.apply({ ...EMPTY_SCENE, nodes: moved })

    expect(placedAt(renderer, 3)).toBe(115)
  })

  it('follows a placement typed rather than dragged', () => {
    const nodes = inARow(WORTH_INSTANCING)
    const renderer = rendererOf({ grouping })
    renderer.apply({ ...EMPTY_SCENE, nodes })

    const moved = nodes.map((node, at) =>
      at === 3
        ? { ...node, transform: { ...node.transform, position: { x: 900, y: 0, z: 0 } } }
        : node,
    )
    renderer.apply({ ...EMPTY_SCENE, nodes: moved })

    expect(placedAt(renderer, 3)).toBe(900)
  })
})

describe.each(DRAWINGS)(
  'the sources a %s group draws for, from outside the engine',
  (_name, drawing) => {
    const inACrate = (): SceneNode[] => [
      groupNodeFixture('crate'),
      ...Array.from({ length: WORTH_INSTANCING }, (_unused, at) => ({
        ...meshNode(`c${at}`, 'crate'),
        transform: {
          position: { x: at * 5, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
        },
      })),
    ]

    it('are no longer walked by a frame, which is what they cost', () => {
      const nodes = inACrate()
      const renderer = rendererOf(drawing)
      renderer.apply({ ...EMPTY_SCENE, nodes })

      const met = walked(graphOf(renderer)).map(object => object.name)
      for (const node of nodes.slice(1)) expect(met).not.toContain(node.id)
      expect(met).toContain('crate')
    })

    it('are still written to the file, under the node they hang from', async () => {
      const nodes = inACrate()
      const renderer = rendererOf(drawing)
      renderer.apply({ ...EMPTY_SCENE, nodes })

      const names = await namesOf(renderer)
      for (const node of nodes) expect(names).toContain(node.id)
    })

    it('are back out of the walk once the file is written', async () => {
      const nodes = inACrate()
      const renderer = rendererOf(drawing)
      renderer.apply({ ...EMPTY_SCENE, nodes })
      await namesOf(renderer)

      const met = walked(graphOf(renderer)).map(object => object.name)
      for (const node of nodes.slice(1)) expect(met).not.toContain(node.id)
    })

    // `both` and not `wireframe`: `showsEdges` draws the overlay for that one and, without quads,
    // leaves `wireframe` to the material's own flag — so the sources carry nothing to draw.
    it('stay in the walk while the edges are on, since they are what carries them', () => {
      const nodes = inACrate()
      const renderer = rendererOf(drawing)
      renderer.apply({ ...EMPTY_SCENE, nodes })

      renderer.setDisplayModes(['both'])

      const met = walked(graphOf(renderer)).map(object => object.name)
      for (const node of nodes.slice(1)) expect(met).toContain(node.id)
    })

    it('leave it again once the edges go', () => {
      const nodes = inACrate()
      const renderer = rendererOf(drawing)
      renderer.apply({ ...EMPTY_SCENE, nodes })

      renderer.setDisplayModes(['both'])
      renderer.setDisplayModes(['shaded'])

      const met = walked(graphOf(renderer)).map(object => object.name)
      for (const node of nodes.slice(1)) expect(met).not.toContain(node.id)
    })

    it('do not come back to it once their node is gone', () => {
      const nodes = inACrate()
      const renderer = rendererOf(drawing)
      renderer.apply({ ...EMPTY_SCENE, nodes })

      renderer.apply({ ...EMPTY_SCENE, nodes: nodes.filter(node => node.id !== 'c0') })
      renderer.setDisplayModes(['both'])

      expect(walked(graphOf(renderer)).map(object => object.name)).not.toContain('c0')
    })

    it('stand where a crate that MOVED puts them, which no walk refreshes any more', () => {
      const nodes = inACrate()
      const renderer = rendererOf(drawing)
      renderer.apply({ ...EMPTY_SCENE, nodes })

      const moved = nodes.map(node =>
        node.id === 'crate'
          ? { ...node, transform: { ...node.transform, position: { x: 100, y: 0, z: 0 } } }
          : node,
      )
      renderer.apply({ ...EMPTY_SCENE, nodes: moved })

      expect(placedAt(renderer, 3)).toBe(115)
    })
  },
)

const KNOB_SHAPE: GeometryDescriptor = {
  kind: 'sphere',
  radius: 0.5,
  widthSegments: 8,
  heightSegments: 6,
}

/** Exercises downward tree readers while grouped bodies leave the source walk. */
describe.each(DRAWINGS)('a crate whose bodies a %s group draws', (_name, drawing) => {
  const inACrate = (): SceneNode[] => [
    groupNodeFixture('crate'),
    ...Array.from({ length: WORTH_INSTANCING }, (_unused, at) => ({
      ...meshNode(`c${at}`, 'crate'),
      transform: {
        position: { x: at * 5, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
    })),
  ]

  const crateOf = (renderer: SceneRenderer): Object3D => {
    const crate = graphOf(renderer).children.find(child => child.name === 'crate')
    if (!crate) throw new Error('the crate was never built')
    return crate
  }

  const settled = (): SceneRenderer => {
    const renderer = rendererOf(drawing)
    renderer.apply({ ...EMPTY_SCENE, nodes: inACrate() })
    return renderer
  }

  it('measures as a box for whoever reads the tree downward', () => {
    const renderer = settled()
    // `as`: the one door every downward reader goes through, and it is private by design.
    const engine = renderer as unknown as {
      withHungUnder: <T>(ids: Iterable<string>, run: () => T) => T
    }

    const empty = engine.withHungUnder(['crate'], () =>
      new Box3().setFromObject(crateOf(renderer)).isEmpty(),
    )
    // Empty is what a selection frame left at the origin, a snap that does nothing and handles
    // sized against nothing all read.
    expect(empty).toBe(false)
    expect(new Box3().setFromObject(crateOf(renderer)).isEmpty()).toBe(true)
  })

  it('is a surface the ray can land on, tile by tile', () => {
    const renderer = settled()
    // `as`: the roots of the surface ray are what a snap intersects, private by design.
    const roots = (renderer as unknown as { surfaceRoots: () => Object3D[] }).surfaceRoots()

    expect(roots.map(object => object.name)).toContain('c3')
  })

  it('leaves the tree exactly as it found it', () => {
    const renderer = settled()
    const before = crateOf(renderer).children.length
    ;(renderer as unknown as { refreshAids: () => void }).refreshAids()

    expect(crateOf(renderer).children).toHaveLength(before)
  })

  it('leaves it alone while a pane shows EDGES, where the sources are already in the walk', () => {
    const renderer = settled()
    // `both` is what hangs every source back under its parent — `showsEdges`, `syncSourceWalk`.
    renderer.setDisplayModes(['both'])
    const before = [...crateOf(renderer).children]
    expect(before).toHaveLength(WORTH_INSTANCING)

    // 🛑 Boxes on everything is what makes `refreshAids` hang anything at all. A second copy
    // pushed while they are already in the walk is filtered out WITH the first: the bodies leave
    // the walk while the grouping still believes them hung, so `hangSources` short-circuits and
    // nothing composes their matrices any more.
    renderer.configure({ ...DEFAULT_SETTINGS.three, boundingBoxes: 'all' })

    expect(crateOf(renderer).children).toEqual(before)
  })

  it('leaves a source a DRAG carried under the pivot where the drag put it', () => {
    const renderer = settled()
    const engine = renderer as unknown as {
      objects: Map<string, Object3D>
      withHungUnder: <T>(ids: Iterable<string>, run: () => T) => T
    }
    const carried = engine.objects.get('c0')
    if (!carried) throw new Error('no body to carry')
    const pivot = new Object3D()
    graphOf(renderer).add(pivot)
    // What `carry` does: `Object3D.attach` ends on `children.push`, whatever the walk holds.
    pivot.attach(carried)

    engine.withHungUnder(['c0'], () => null)

    // 🛑 Shaded, so no pane hangs anything — yet the body IS in the walk. A second copy pushed
    // and both filtered out leaves it parented to the pivot and in nobody's children: its matrix
    // stops being composed, and `release` reads an empty pivot, so the drag reports nothing.
    expect(pivot.children).toContain(carried)
  })

  it('still measures a box while a pane shows edges', () => {
    const renderer = settled()
    renderer.setDisplayModes(['both'])
    const engine = renderer as unknown as {
      withHungUnder: <T>(ids: Iterable<string>, run: () => T) => T
    }

    const empty = engine.withHungUnder(['crate'], () =>
      new Box3().setFromObject(crateOf(renderer)).isEmpty(),
    )

    expect(empty).toBe(false)
  })

  it('holds every body of a crate whose bodies each carry a node', () => {
    const nodes: SceneNode[] = [
      groupNodeFixture('crate'),
      ...Array.from({ length: WORTH_INSTANCING }, (_unused, at) => ({
        ...meshNode(`c${at}`, 'crate'),
        transform: {
          position: { x: at * 5, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
        },
      })),
      // One group of bodies hanging from another, which is what makes the guard read the
      // document: a second pass finds the parents' `children` already emptied by the first.
      ...Array.from({ length: WORTH_INSTANCING }, (_unused, at) => ({
        ...meshNode(`k${at}`, `c${at}`),
        geometry: KNOB_SHAPE,
      })),
    ]
    const renderer = rendererOf(drawing)
    renderer.apply({ ...EMPTY_SCENE, nodes })
    renderer.apply({ ...EMPTY_SCENE, nodes: [...nodes] })
    renderer.apply({ ...EMPTY_SCENE, nodes: [...nodes] })

    const met = walked(graphOf(renderer)).map(object => object.name)
    // The carriers stay in the walk however many passes run: their own children hang from them.
    for (let at = 0; at < WORTH_INSTANCING; at += 1) expect(met).toContain(`c${at}`)
  })

  it('places the body of a body where its own parent stands', () => {
    const nodes: SceneNode[] = [
      groupNodeFixture('crate'),
      ...Array.from({ length: WORTH_INSTANCING }, (_unused, at) => ({
        ...meshNode(`c${at}`, 'crate'),
        transform: {
          position: { x: at * 5, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
        },
      })),
      ...Array.from({ length: WORTH_INSTANCING }, (_unused, at) => ({
        ...meshNode(`k${at}`, `c${at}`),
        geometry: KNOB_SHAPE,
      })),
    ]
    const renderer = rendererOf(drawing)
    renderer.apply({ ...EMPTY_SCENE, nodes })

    const knob = (renderer as unknown as { objects: Map<string, Object3D> }).objects.get('k3')
    expect(knob?.getWorldPosition(new Vector3()).x).toBe(15)
  })
})
