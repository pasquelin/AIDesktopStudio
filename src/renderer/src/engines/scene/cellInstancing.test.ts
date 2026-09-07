import { BoxGeometry, Group, InstancedMesh, Matrix4, Mesh, Object3D, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { walked } from './scene-fixtures'
import { bodies, host, inOneCell, looking } from './cellInstancing-fixtures'
import { isDrawn, WORTH_INSTANCING } from './grouping'
import { createCellGroups } from './cellInstancing'
import { CELL_SIZE } from './worldPartition'
import type { SceneNode } from './sceneState'

const ASIDE_AT = CELL_SIZE + 20

/**
 * One lot over TWO cells of the same zone: one ahead of the camera, one beside it. The shape and
 * the paint are shared, so the two are one group cut in two by the grid — the case the box is for.
 */
function aheadAndAside(): {
  scene: Object3D
  groups: ReturnType<typeof createCellGroups>
} {
  const scene = host()
  const shape = new BoxGeometry(1, 1, 1)
  const ahead = bodies(inOneCell(WORTH_INSTANCING, 20), shape, 0, 'a')
  const aside = bodies(inOneCell(WORTH_INSTANCING, 0), shape, ASIDE_AT, 'b')
  const objects = new Map([...ahead.objects, ...aside.objects])
  // The same material object on both, so the spelling of the group is the same one.
  for (const mesh of aside.objects.values()) {
    const first = ahead.objects.get('a0')
    if (first) mesh.material = first.material
  }
  const groups = createCellGroups(scene)
  groups.rebuild([...ahead.nodes, ...aside.nodes], id => objects.get(id))
  return { scene, groups }
}

const cellsIn = (scene: Object3D): Group[] => scene.children.filter(child => child instanceof Group)

const instancesIn = (scene: Object3D): InstancedMesh[] =>
  walked(scene).filter(child => child instanceof InstancedMesh)

/** Two cells a level apart, already built — what both the zone and a rebuild are read on. */
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

/** Where each cell the scene still holds stands, along x — one number per cell, sorted. */
const standingIn = (scene: Object3D): number[] =>
  cellsIn(scene)
    .flatMap(cell => cell.children.filter(child => child instanceof InstancedMesh))
    .map(mesh => mesh.instanceMatrix.array[12] ?? 0)
    .toSorted((one, other) => one - other)

describe('createCellGroups', () => {
  it('leaves an ordinary scene alone, drawing nothing of its own', () => {
    const scene = host()
    const { nodes, objects } = bodies(inOneCell(WORTH_INSTANCING - 1, 0))

    expect(createCellGroups(scene).rebuild(nodes, id => objects.get(id))).toBe(0)
    expect(scene.children).toHaveLength(0)
  })

  it('draws a repeated shape through one instance per cell of the world', () => {
    const scene = host()
    const { nodes, objects } = bodies([
      ...inOneCell(WORTH_INSTANCING, 0),
      ...inOneCell(WORTH_INSTANCING, 4 * CELL_SIZE),
    ])

    const count = createCellGroups(scene).rebuild(nodes, id => objects.get(id))

    // Two cells, two calls — where the triangle budget answers ONE region covering both, and
    // draws all thirty-two bodies whatever the view. That is the whole of the gain.
    expect(count).toBe(2 * WORTH_INSTANCING)
    expect(cellsIn(scene)).toHaveLength(2)
    expect(instancesIn(scene)).toHaveLength(2)
  })

  it('carries the shadow flags of the meshes it draws for', () => {
    const scene = host()
    const { nodes, objects } = bodies(inOneCell(WORTH_INSTANCING, 0))
    for (const mesh of objects.values()) {
      mesh.castShadow = true
      mesh.receiveShadow = true
    }

    createCellGroups(scene).rebuild(nodes, id => objects.get(id))

    // The sources sit on a layer the shadow camera never looks at: left at their default, a
    // whole cell would neither cast a shadow nor catch one.
    const instance = instancesIn(scene)[0]
    expect({ cast: instance?.castShadow, receive: instance?.receiveShadow }).toEqual({
      cast: true,
      receive: true,
    })
  })

  it('splits one cell in two when the bodies of a group answer differently to a shadow', () => {
    const scene = host()
    const { nodes, objects } = bodies(inOneCell(2 * WORTH_INSTANCING, 0))
    // Same shape, same paint, same cell: the flags are the ONLY thing telling the two apart.
    for (const [at, mesh] of [...objects.values()].entries()) mesh.castShadow = at % 2 === 0

    createCellGroups(scene).rebuild(nodes, id => objects.get(id))

    // An `InstancedMesh` carries ONE `castShadow` for every body in it: fused, half of them would
    // throw a shadow they do not have, or lose the one they do.
    expect(
      instancesIn(scene)
        .map(mesh => mesh.castShadow)
        .toSorted(),
    ).toEqual([false, true])
  })

  it('leaves the matrices of what it draws at identity, which is where they belong', () => {
    const scene = host()
    const { nodes, objects } = bodies(inOneCell(WORTH_INSTANCING, 0))
    createCellGroups(scene).rebuild(nodes, id => objects.get(id))

    scene.updateMatrixWorld(true)

    // The instance holds WORLD matrices, so its own must stay identity — that is what makes it
    // safe to leave the cell out of the walk, and what the frustum tests it by.
    expect(instancesIn(scene)[0]?.matrixWorld.equals(new Matrix4())).toBe(true)
  })

  it('keeps repeated wide bodies in distant spatial zones', () => {
    const scene = host()
    const wide = new BoxGeometry(4 * CELL_SIZE, 1, 4 * CELL_SIZE)
    const places = [
      ...inOneCell(WORTH_INSTANCING / 2, 3 * CELL_SIZE),
      ...inOneCell(WORTH_INSTANCING / 2, 20 * CELL_SIZE),
    ]
    const { nodes, objects } = bodies(places, wide)
    const groups = createCellGroups(scene)

    groups.rebuild(nodes, id => objects.get(id))

    // A building, a terrain slab, a scenery rock: wider than a cell, and still worth culling. Put
    // on the global fallback they would draw whatever the view, which is what the grid is for.
    expect(cellsIn(scene)).toHaveLength(2)
    expect(scene.children.filter(child => child instanceof InstancedMesh)).toHaveLength(0)
    groups.follow?.(looking(0, 500))
    expect(standingIn(scene)).toEqual([3 * CELL_SIZE])
  })

  it('keeps an extreme body on the conservative global fallback', () => {
    const scene = host()
    const extreme = new BoxGeometry(32 * CELL_SIZE, 1, 32 * CELL_SIZE)
    const { nodes, objects } = bodies(inOneCell(WORTH_INSTANCING, 0), extreme)

    createCellGroups(scene).rebuild(nodes, id => objects.get(id))

    // Past `MAX_SPATIAL_REACH` a query would have to reach that far around every eye, and the
    // grid stops partitioning. It hangs from the host instead, which no zone turns off.
    expect(cellsIn(scene)).toHaveLength(0)
    expect(scene.children.filter(child => child instanceof InstancedMesh)).toHaveLength(1)
  })

  describe('a hit no lot owns', () => {
    const hitOn = (object: Object3D, instanceId?: number) => ({
      object,
      distance: 1,
      point: new Vector3(),
      instanceId,
    })

    it('answers nothing for an object or slot no lot owns', () => {
      const scene = host()
      const { nodes, objects } = bodies(inOneCell(WORTH_INSTANCING, 0))
      const groups = createCellGroups(scene)
      groups.rebuild(nodes, id => objects.get(id))
      const drawn = groups.pickable?.()[0]

      // A gizmo or a helper over a lot answers `null`, never the node beneath: a click that lands
      // on a tool must not select what it was drawn on top of.
      expect(groups.nodeIdOf?.(hitOn(new Mesh(), 0))).toBeNull()
      expect(drawn && groups.nodeIdOf?.(hitOn(drawn, 999))).toBeNull()
      expect(drawn && groups.nodeIdOf?.(hitOn(drawn))).toBeNull()
    })
  })
})

describe('the zone a camera holds', () => {
  it('draws every cell until a camera says where it stands', () => {
    const { scene } = twoCells()

    // The resting state, and it is what makes the flag safe: an engine that never follows a
    // camera draws exactly what it drew before.
    expect(standingIn(scene)).toEqual([0, 20 * CELL_SIZE])
  })

  it('takes the cells the view cannot reach out of the scene', () => {
    const { scene, groups } = twoCells()

    const moved = groups.follow?.(looking(0, 500))

    // 🛑 OUT of it, not merely turned off: `visible` stops `projectObject` and nothing else, and
    // `updateMatrixWorld` walks every child whatever the flag says — 0.97 ms a frame of pure
    // walking on 6 912 meshes that draw nothing.
    expect(moved).toBe(true)
    expect(standingIn(scene)).toEqual([0])
  })

  /**
   * 🛑 The follow is MEMOISED on the camera, the cast and a revision — measured at 9,43 ms a frame
   * on 512 cells of 8 192 bodies, all in view, paid again every frame for the same answer. What
   * these cases guard is the other half: that no change is skipped along with it.
   *
   * 🛑 Its blind spots, in clear, because they were both MEASURED rather than assumed:
   *
   * **The CAST is in the key and nothing here reads it** — these bodies sit on the floor, so
   * `sweptBy` extends their boxes by zero whatever the sun does. **The REVISION is in it and
   * nothing here reads that either** — a cell this decor rebuilds keeps the `visible` a cull left
   * on it, and a group a follow took out of the scene is not hung back by `groupOf`. Both were
   * written as cases first, and both stayed green with their half of the key removed.
   *
   * What holds them is therefore the READING, not this file: every site that changes what a cell
   * covers bumps `visibility` in `cellInstancingGroups`, and they are named there one by one.
   */
  describe('the follow a still frame does not pay twice', () => {
    it('answers nothing moved when neither the eye nor the scene did', () => {
      const { groups } = twoCells()
      groups.follow?.(looking(0, 500))

      expect(groups.follow?.(looking(0, 500))).toBe(false)
    })

    it('sees the eye move, and takes the cell it left out of the scene', () => {
      const { scene, groups } = twoCells()
      groups.follow?.(looking(0, 100000))
      expect(standingIn(scene)).toHaveLength(2)

      groups.follow?.(looking(0, 500))

      expect(standingIn(scene)).toEqual([0])
    })

    /**
     * 🛑 The cell is REBUILT into the scene standing and visible, so only a fresh follow can take
     * it back out. Asserting on what a rebuild alone already changed passes with the revision
     * left out of the key entirely — which is how this case was first written, and green.
     */
  })

  it('puts them back when the camera comes to them', () => {
    const { scene, groups } = twoCells()
    groups.follow?.(looking(0, 500))

    groups.follow?.(looking(20 * CELL_SIZE, 500))

    expect(standingIn(scene)).toEqual([20 * CELL_SIZE])
  })

  it('says nothing moved when the camera stayed in its zone', () => {
    const { groups } = twoCells()
    groups.follow?.(looking(0, 500))

    // What the answer is READ for: it is what asks for the shadow maps to be drawn again, and a
    // still viewport must not ask for one per frame.
    expect(groups.follow?.(looking(1, 500))).toBe(false)
  })

  it('draws every cell again for a render that names no camera', () => {
    const { scene, groups } = twoCells()
    groups.follow?.(looking(0, 500))

    groups.follow?.(null)

    // A film, a capture and a preview render from a camera of their own without ever following
    // one. A zone narrowed for the viewport would cut bodies out of what they write.
    expect(standingIn(scene)).toEqual([0, 20 * CELL_SIZE])
  })

  it('draws a whole level from a view wide enough to hold it', () => {
    const { scene, groups } = twoCells()

    groups.follow?.(looking(0, 40 * CELL_SIZE))

    // The pixel-for-pixel case: nothing a view could show is ever left out, so an ordinary scene
    // under the flag draws exactly the image it drew without it.
    expect(standingIn(scene)).toEqual([0, 20 * CELL_SIZE])
  })
})

describe('where the zone believes the eye stands', () => {
  it('reads the camera in WORLD space, not where its parent left it', () => {
    const scene = host()
    const { nodes, objects } = bodies(inOneCell(WORTH_INSTANCING, 0))
    const groups = createCellGroups(scene)
    groups.rebuild(nodes, id => objects.get(id))

    // A camera of the document hangs under what carries it — a rig, a rail, a group.
    const rig = new Object3D()
    rig.position.set(40 * CELL_SIZE, 0, 0)
    const camera = looking(0, 500)
    rig.add(camera)
    rig.updateMatrixWorld(true)
    groups.follow?.(camera)

    // 🛑 Read LOCAL, the disc lands on the origin and holds a cell the eye is ten thousand units
    // from. Measured on what the scene HOLDS: the frustum test below is already in world space,
    // so it hides the mistake by turning the cell off instead of taking it out.
    expect(standingIn(scene)).toEqual([])
  })

  it('reads it where it stands NOW, not where the last frame drew it', () => {
    const { scene, groups } = twoCells()
    const camera = looking(0, 500)
    groups.follow?.(camera)
    expect(drawnIn(scene)).toHaveLength(1)

    // 🛑 What `OrbitControls` does, and what a pane sees: it writes `position`, and only `render`
    // composes the matrices — so `matrixWorldInverse` still holds LAST frame's pose. The zone
    // itself follows (it reads the position), which is why this is measured on what is DRAWN.
    camera.position.set(20 * CELL_SIZE, 0, 0)
    groups.follow?.(camera)

    expect(drawnIn(scene)).toHaveLength(1)
  })
})

describe('the box a bucket really occupies', () => {
  it('stops drawing what the view cannot reach, without moving its cell out of the scene', () => {
    const { scene, groups } = aheadAndAside()

    groups.follow?.(looking(0, 500))

    // 🛑 Measured on 500 000 bodies: the box rejects 155 of the 381 calls three's SPHERE lets
    // through, and every one of them was drawing no visible instance at all. The cell stays in
    // the scene — the zone is a disc on purpose, and what a shadow needs is not what a view does.
    expect(cellsIn(scene)).toHaveLength(2)
    const shown = drawnIn(scene)
    expect(shown).toHaveLength(1)
    expect(shown[0]?.instanceMatrix.array[14]).toBe(0)
  })

  it('draws it again once the camera turns to it', () => {
    const { scene, groups } = aheadAndAside()
    groups.follow?.(looking(0, 500))

    groups.follow?.(looking(0, 500, { x: 0, z: 1 }))

    const shown = drawnIn(scene)
    expect(shown).toHaveLength(1)
    expect(shown[0]?.instanceMatrix.array[14]).toBe(ASIDE_AT)
  })

  it('draws every bucket again for a render that names no camera', () => {
    const { scene, groups } = aheadAndAside()
    groups.follow?.(looking(0, 500))

    groups.follow?.(null)

    expect(drawnIn(scene)).toHaveLength(instancesIn(scene).length)
  })
})

describe('the shadow a rejected bucket would have thrown', () => {
  /** Un soleil bas en +z : les ombres partent vers -z, donc vers l'axe où la caméra regarde. */
  const LOW_SUN = { along: [{ x: 0, y: -0.316, z: -0.948 }], floor: -100, reach: 10_000 }

  /** Un second soleil, opposé : son ombre part vers +z, donc à l'écart de ce que la caméra voit. */
  const AWAY = { x: 0, y: -0.316, z: 0.948 }

  it('keeps a bucket out of the view whose shadow falls into it', () => {
    const { scene, groups } = aheadAndAside()
    groups.follow?.(looking(0, 500))
    expect(drawnIn(scene)).toHaveLength(1)

    groups.follow?.(looking(0, 500), LOW_SUN)

    // Hiding a caster hides its shadow with it: `WebGLShadowMap.renderObject` returns on
    // `visible === false` and tests `layers` against the VIEW camera, so neither flag can spare
    // one pass and not the other. Measured on pillars just out of frame: 2.0 % of the pixels
    // lost their shadow, and it came back the moment the camera turned to them.
    expect(drawnIn(scene)).toHaveLength(2)
  })

  it('hides it again under a sun overhead, whose shadow falls under the body', () => {
    const { scene, groups } = aheadAndAside()

    groups.follow?.(looking(0, 500), { along: [{ x: 0, y: -1, z: 0 }], floor: -1, reach: 10_000 })

    expect(drawnIn(scene)).toHaveLength(1)
  })

  it('reads EVERY casting light, not just the one that happened to come first', () => {
    const { scene, groups } = aheadAndAside()

    // 🛑 The one that throws INTO the view is second. A set lit from two sides has no order the
    // document decides: whichever light `this.objects` yields first would win.
    groups.follow?.(looking(0, 500), {
      along: [AWAY, LOW_SUN.along[0]!],
      floor: -100,
      reach: 10_000,
    })

    expect(drawnIn(scene)).toHaveLength(2)
  })

  it('stops the sweep where the shadow MAP does, so a sun at the horizon still culls', () => {
    const { scene, groups } = aheadAndAside()

    // 🛑 `far = drop / -along.y`. A sun a hair above setting divides by a vanishing slope: the
    // box sweeps to infinity, every cell passes, and the partition quietly stops partitioning —
    // no error, no log, and statistics that read perfectly normal. `fitShadowCamera` bounds every
    // shadow camera to `reach`, so past it nothing is drawn anyway.
    groups.follow?.(looking(0, 500), { along: [{ x: 0, y: -1e-6, z: -1 }], floor: -100, reach: 10 })

    expect(drawnIn(scene)).toHaveLength(1)
  })

  it('hides it when NO light throws its shadow into the view', () => {
    const { scene, groups } = aheadAndAside()

    groups.follow?.(looking(0, 500), {
      along: [AWAY, { x: 0, y: -1, z: 0 }],
      floor: -1,
      reach: 10_000,
    })

    expect(drawnIn(scene)).toHaveLength(1)
  })
})

describe('a cell whose bodies moved without changing cell', () => {
  it('is measured again, so a body carried back into view is drawn again', () => {
    const scene = host()
    const shape = new BoxGeometry(1, 1, 1)
    // Off to the side of a view aimed along x, but in the cell the camera stands in.
    const { nodes, objects } = bodies(inOneCell(WORTH_INSTANCING, 20), shape, 200)
    const groups = createCellGroups(scene)
    groups.rebuild(nodes, id => objects.get(id))
    groups.follow?.(looking(0, 500))
    expect(drawnIn(scene)).toHaveLength(0)

    for (const mesh of objects.values()) {
      mesh.position.setZ(0)
      mesh.updateMatrixWorld(true)
    }
    groups.rebuild(nodes, id => objects.get(id))
    groups.follow?.(looking(0, 500))

    expect(drawnIn(scene)).toHaveLength(1)
  })
})
