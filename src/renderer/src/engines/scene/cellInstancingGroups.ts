import {
  Box3,
  Group,
  InstancedMesh,
  type BufferGeometry,
  type Matrix4,
  type Material,
  type Mesh,
  type Object3D,
  type Intersection,
} from 'three'
import { cellPicking, sourcesByNode } from './cellInstancingPicking'
import {
  dropSlotsOf,
  heldOutOfDraw,
  refreshMovedSources,
  pushSlot,
  shapeAndPaint,
  slotOn,
  withFlags,
  sweep,
  widen,
  worldReach,
  writeMoved,
  type Grouped,
  type GroupingStats,
  type InstancedGroups,
  type Placed,
} from './grouping'
import { buildPartition, MAX_SPATIAL_REACH, type CellKey } from './worldPartition'
import {
  AT,
  grow,
  splitByCell,
  type Bucket,
  type Held,
  type Members,
  type Mobile,
} from './cellInstancingGeometry'
import { settleCellBucket } from './cellBucketSettlement'
import { followCells, newFollowMemory } from './cellVisibility'
/**
 * Draws a repeated shape through one `InstancedMesh` per CELL of the world, and turns off the
 * cells the camera cannot reach.
 *
 * `createInstancedGroups` cuts a group on a budget of TRIANGLES, which says nothing about where
 * the bodies stand: measured on a level of 500 000, 19 regions of cubes covered the whole world
 * and drew their 223 488 instances whatever the view. The grain here is spatial and fixed, so a
 * lot can never spread past one cell — 20 462 instances for the same view, and 2.26 ms of GPU
 * against 2.86.
 *
 * 🛑 A mesh is the unit of culling, and reducing the meshes costs more than it gives back:
 * measured three times, one `BatchedMesh` per lot draws 45 789 instances where this draws 20 462.
 * See RAPPORT-C5B2 § 3.
 */
export function createCellGroups(
  host: Object3D,
  ownMaterialOf: (mesh: Mesh) => Material | Material[] = mesh => mesh.material,
): InstancedGroups {
  const {
    index,
    cells,
    buckets,
    placed,
    sources,
    keyOf,
    near,
    standing,
    wanted,
    boxes,
    owners,
    bucketOf,
    mobiles,
    promoted,
    lotOf,
  } = cellGroupState()
  /** The widest body still held in a cell, so a query reaches the ones straddling its edge. */
  let queryReach = index.cellSize / 2
  /** Its `revision` is bumped by every change a follow must see again — see `FollowMemory`. */
  const memory = newFollowMemory()
  let pass = 0
  let listed: InstancedMesh[] = []
  let sourcesById: ReadonlyMap<string, Mesh[]> = new Map()
  let listStale = true
  const groupOf = (cell: CellKey | null): Object3D => {
    if (cell === null) return host
    memory.revision += 1
    const known = cells.get(cell)
    if (known) {
      known.stale = true
      return known.group
    }
    const group = new Group()
    group.matrixAutoUpdate = false
    host.add(group)
    cells.set(cell, { group, box: new Box3(), stale: true })
    standing.add(cell)
    index.hold(cell)
    return group
  }
  const drop = (bucket: Bucket): void => {
    // Only where it still points here: a node this pass moved to another bucket was written
    // before this one was dropped, and deleting by id alone would lose it.
    for (const id of bucket.ids) dropSlotsOf(placed, id, bucket.mesh)
    bucket.mesh.removeFromParent()
    bucket.mesh.dispose()
    // NOT the group's key with it: `settle` drops the bucket it replaces, and unhooking the map
    // there orphans the one `rebuild` just hung — the fresh bucket lands where nothing lists it.
    bucket.owner.delete(bucket.cell)
    listStale = true
    if (bucket.cell === null) return
    const held = cells.get(bucket.cell)
    if (!held) return
    memory.revision += 1
    held.stale = true
    if (held.group.children.length > 0) return
    held.group.removeFromParent()
    cells.delete(bucket.cell)
    standing.delete(bucket.cell)
    index.release(bucket.cell)
  }
  function* everyBucket(): Generator<Bucket> {
    for (const byCell of buckets.values()) yield* byCell.values()
  }
  const settle = (
    into: Map<CellKey | null, Bucket>,
    cell: CellKey | null,
    members: Members,
    worn: Grouped,
    shape: BufferGeometry,
  ): void => {
    settleCellBucket(
      {
        pass,
        cells,
        placed,
        boxes,
        owners,
        bucketOf,
        drop,
        groupOf,
        markListStale: () => {
          listStale = true
        },
      },
      into,
      cell,
      members,
      worn,
      shape,
    )
  }
  const takeOut = (mesh: InstancedMesh, ids: string[], slot: number): void => {
    // The last instance fills the removed slot, avoiding a splice and every following write.
    const removed = ids[slot]
    const last = ids.length - 1
    const swapped = ids[last]
    if (slot !== last && swapped !== undefined) {
      mesh.getMatrixAt(last, AT)
      mesh.setMatrixAt(slot, AT)
      mesh.instanceMatrix.addUpdateRange(slot * 16, 16)
      ids[slot] = swapped
      const moved = slotOn(placed, swapped, mesh)
      if (moved) moved.slot = slot
    }
    ids.pop()
    mesh.count = ids.length
    mesh.instanceMatrix.needsUpdate = true
    if (removed) dropSlotsOf(placed, removed, mesh)
  }
  const growLot = (
    key: string,
    like: InstancedMesh | Mesh,
    held: Mobile | undefined,
    paint: Material | Material[],
  ): Mobile => {
    // `paint` is the group's own; the mesh may currently wear a temporary display material.
    const room = Math.max(32, (held?.ids.length ?? 0) * 2)
    const mesh = new InstancedMesh(like.geometry, paint, room)
    mesh.matrixAutoUpdate = false
    // 🛑 A mover goes anywhere: a bounding sphere measured once is wrong at its first step, and
    // three would cull the lot off screen while its bodies are in front of the camera.
    mesh.frustumCulled = false
    mesh.castShadow = like.castShadow
    mesh.receiveShadow = like.receiveShadow
    const ids = held?.ids ?? []
    for (const [slot, id] of ids.entries()) {
      held?.mesh.getMatrixAt(slot, AT)
      mesh.setMatrixAt(slot, AT)
      const previous = held ? slotOn(placed, id, held.mesh) : undefined
      if (held) dropSlotsOf(placed, id, held.mesh)
      if (previous) pushSlot(placed, id, { instance: mesh, slot, source: previous.source })
    }
    mesh.count = ids.length
    mesh.instanceMatrix.needsUpdate = true
    if (held) {
      held.mesh.removeFromParent()
      held.mesh.dispose()
    }
    host.add(mesh)
    const lot: Mobile = { mesh, ids, paint }
    mobiles.set(key, lot)
    lotOf.set(mesh, lot)
    listStale = true
    built = true
    return lot
  }
  /** Whether a mesh was made outside a rebuild, for the pane that has to dress what was made. */
  let built = false
  const promote = (id: string, objectOf: (id: string) => Object3D | undefined): void => {
    // Promotion is sticky so later rebuilds never put the moving body back on the grid.
    const slots = [...(placed.get(id) ?? [])]
    if (!objectOf(id) || slots.length === 0) return
    for (const at of slots) {
      if (lotOf.has(at.instance)) continue
      const bucket = bucketOf.get(at.instance)
      if (!bucket) continue
      takeOut(at.instance, bucket.ids, at.slot)
      const held = mobiles.get(bucket.key)
      const lot =
        !held || held.ids.length >= held.mesh.instanceMatrix.count
          ? growLot(bucket.key, at.instance, held, held?.paint ?? bucket.paint)
          : held
      pushOnto(lot, id, at.source.matrixWorld, at.source)
      lot.mesh.instanceMatrix.needsUpdate = true
    }
    promoted.add(id)
  }
  /** Takes a body onto the end of a lot, at a slot that is now its own. */
  const pushOnto = (lot: Mobile, id: string, placement: Matrix4, source: Mesh): void => {
    const slot = lot.ids.length
    lot.ids.push(id)
    lot.mesh.count = lot.ids.length
    lot.mesh.setMatrixAt(slot, placement)
    lot.mesh.instanceMatrix.addUpdateRange(slot * 16, 16)
    // three caches the sphere at the FIRST ray and never invalidates it, and a lot is kept across
    // rebuilds: without this a body settled beyond it is silently out of every click.
    widen(lot.mesh.boundingSphere, lot.mesh.geometry, placement)
    pushSlot(placed, id, { instance: lot.mesh, slot, source })
  }
  /** Whether a body is already drawn by a lot of movers rather than by a cell. */
  const onLot = (id: string): boolean => {
    const slots = placed.get(id)
    return !!slots && slots.length > 0 && slots.every(at => lotOf.has(at.instance))
  }
  const settleMobile = (
    key: string,
    members: Members,
    like: InstancedMesh | Mesh,
    paint: Material | Material[],
  ): void => {
    // Existing movers retain their slots across rebuilds.
    if (members.ids.length === 0 && !mobiles.has(key)) return
    let lot = mobiles.get(key)
    // 🛑 The paint of the pass, not the one the lot was born with. A cell is rebuilt whenever its
    // members change, so it can never hold a stale material; a lot is KEPT across rebuilds, and
    // the body its material came from can be deleted under it — `disposeMaterial` then destroys
    // what everyone else on the lot is still drawn with.
    if (lot && lot.paint !== paint) {
      lot.paint = paint
      lot.mesh.material = paint
    }
    for (const [at, id] of members.ids.entries()) {
      lot = settleMobileMember(key, id, members.meshes[at], like, paint, lot)
    }
    if (lot) lot.mesh.instanceMatrix.needsUpdate = true
  }
  const settleMobileMember = (
    key: string,
    id: string,
    source: Mesh | undefined,
    like: InstancedMesh | Mesh,
    paint: Material | Material[],
    lot: Mobile | undefined,
  ): Mobile | undefined => {
    if (!source) return lot
    const held = lot ? slotOn(placed, id, lot.mesh) : undefined
    if (lot && held) {
      lot.mesh.setMatrixAt(held.slot, source.matrixWorld)
      lot.mesh.instanceMatrix.addUpdateRange(held.slot * 16, 16)
      // The same cached sphere, on the body that KEPT its slot: a rebuild moves it just as a
      // promotion places it, and three would never widen it again.
      widen(lot.mesh.boundingSphere, lot.mesh.geometry, source.matrixWorld)
      return lot
    }
    const available =
      !lot || lot.ids.length >= lot.mesh.instanceMatrix.count ? growLot(key, like, lot, paint) : lot
    pushOnto(available, id, source.matrixWorld, source)
    return available
  }
  const shed = (seen: ReadonlyMap<string, string>): void => {
    // Walk backwards because removing a slot fills it from the end.
    for (const [key, lot] of mobiles) {
      for (let slot = lot.ids.length - 1; slot >= 0; slot -= 1) {
        const id = lot.ids[slot]
        if (id === undefined || seen.get(id) === key) continue
        takeOut(lot.mesh, lot.ids, slot)
        // 🛑 Only when nothing else claimed it. A body that changed group is on ANOTHER lot as of
        // this pass, and it is still a mover: forgetting that put it back in a static cell, which
        // every change of content then rebuilt for it.
        if (slotOn(placed, id, lot.mesh)) {
          dropSlotsOf(placed, id, lot.mesh)
          if (!placed.has(id)) promoted.delete(id)
        }
      }
      // 🛑 Emptied is not gone. Left here the lot stays hung from the host, listed by `drawn()` —
      // so walked by every dress of every pane — and its instance buffer stays on the GPU until
      // the document closes. One edit of a material on a mover leaked one.
      if (lot.ids.length === 0) release(key, lot)
    }
  }
  /** Gives an emptied lot back: out of the scene, off the GPU, and out of every index. */
  const release = (key: string, lot: Mobile): void => {
    lot.mesh.removeFromParent()
    lot.mesh.dispose()
    lotOf.delete(lot.mesh)
    mobiles.delete(key)
    listStale = true
  }
  const growBoxes = (id: string, objectOf: (id: string) => Object3D | undefined): void => {
    // A moved body's bucket and cell only grow until the next rebuild remeasures them.
    const slots = placed.get(id)
    if (!slots) return
    const object = objectOf(id)
    if (!object) return
    memory.revision += 1 // A grown box changes a cell's cover without ever marking it stale.
    for (const at of slots) {
      const box = boxes.get(at.instance)
      const cell = owners.get(at.instance)
      // A mover has neither, and asking for its reach first cost 1.0 ms a frame on 5 015 of them.
      if (!box && !cell) continue
      const reach = worldReach(at.instance.geometry, at.source.matrixWorld)
      if (box) grow(box, at.source.matrixWorld, reach)
      if (cell) grow(cell.box, at.source.matrixWorld, reach)
    }
  }
  const drawEvery = (): boolean => {
    let moved = false
    for (const [key, held] of cells) {
      if (!held.group.visible) {
        held.group.visible = true
        moved = true
      }
      for (const child of held.group.children) {
        if (child.visible) continue
        child.visible = true
        moved = true
      }
      if (standing.has(key)) continue
      host.add(held.group)
      standing.add(key)
      moved = true
    }
    return moved
  }
  const clear = (): void => {
    for (const bucket of everyBucket()) drop(bucket)
    buckets.clear()
    // The movers with them: they hang from the host and no bucket names them, so a `dispose`
    // that only walked the cells left their instance buffers on the GPU and their meshes in the
    // scene — the one half of the teardown a test that never promoted anything could not see.
    for (const lot of mobiles.values()) {
      for (const id of lot.ids) dropSlotsOf(placed, id, lot.mesh)
      lot.mesh.removeFromParent()
      lot.mesh.dispose()
    }
    mobiles.clear()
    promoted.clear()
    listStale = true
  }
  const drawnMeshes = (): readonly InstancedMesh[] => {
    if (listStale) {
      listed = []
      for (const bucket of everyBucket()) listed.push(bucket.mesh)
      for (const lot of mobiles.values()) listed.push(lot.mesh)
      listStale = false
    }
    return listed
  }
  const nodeIdOf = (hit: Intersection): string | null => {
    if (!(hit.object instanceof InstancedMesh) || hit.instanceId === undefined) return null
    const ids = lotOf.get(hit.object)?.ids ?? bucketOf.get(hit.object)?.ids
    return ids?.[hit.instanceId] ?? null
  }
  /** What nothing settled on holds bodies that left, were hidden, or changed group. */
  const dropWhatThePassMissed = (seen: Map<string, string>): void => {
    for (const bucket of everyBucket()) if (bucket.seenAt !== pass) drop(bucket)
    for (const [key, byCell] of buckets) if (byCell.size === 0) buckets.delete(key)
    // A mover the sweep no longer met is gone from the document — the despawn half of a spawn.
    shed(seen)
  }

  return {
    rebuild: (nodes, objectOf, excluded) => {
      const groups = sweep(nodes, objectOf, host, ownMaterialOf, keyOf, sources, excluded)
      queryReach = measuredReach(groups, index.cellSize / 2)
      memory.revision += 1
      pass += 1
      /** Which lot each mover belongs to THIS pass, by group key — see `shed`. */
      const seen = new Map<string, string>()
      let instanced = 0
      sourcesById = sourcesByNode(groups)
      for (const worn of groups) {
        const first = worn.meshes[0]
        if (!first) continue
        const movers: Members = { ids: [], meshes: [] }
        const split = splitByCell(worn, index, first.geometry, seen, movers, promoted)
        // An all-moving group has no cell and would allocate a bucket only to drop it this pass.
        if (split.size > 0) {
          const into = buckets.get(worn.key) ?? new Map<CellKey | null, Bucket>()
          buckets.set(worn.key, into)
          for (const [cell, members] of split) settle(into, cell, members, worn, first.geometry)
        }
        settleMobile(worn.key, movers, first, worn.material)
        instanced += worn.meshes.length
      }
      dropWhatThePassMissed(seen)
      return instanced
    },
    moved: (rawIds, objectOf) => {
      const ids = refreshMovedSources(sources, rawIds, objectOf)
      // Promoted BEFORE the write, so the matrix lands in the lot the body now belongs to.
      for (const id of ids) if (!onLot(id)) promote(id, objectOf)
      const touched = writeMoved(placed, ids, objectOf)
      // Grown, never recut, exactly as the sphere is: a box that shrank under a moving body
      // would hide geometry that is on screen. A mover has neither box nor cell, so this is a
      // no-op for it — which is the point of taking it off the grid.
      if (touched) for (const id of ids) growBoxes(id, objectOf)
      return touched
    },
    drawn: drawnMeshes,
    ...cellPicking(everyBucket, standing, mobiles, () => sourcesById),
    nodeIdOf,
    follow: (camera, cast) =>
      followCells(
        { host, index, cells, standing, wanted, near, boxes, drawEvery, queryReach, memory },
        camera,
        cast,
      ),
    builtAnew: () => {
      const made = built
      built = false
      return made
    },
    stats: (): GroupingStats => {
      const { nodesVisited, cellsReturned, cells: held, bytes } = index.stats()
      return { nodesVisited, cellsReturned, cellsStanding: standing.size, cells: held, bytes }
    },
    ...sources.fields(() => {
      clear()
      sourcesById = new Map()
    }),
  }
}
/**
 * How far a query has to reach past a cell, from the widest body still filed in one. Anything
 * past `MAX_SPATIAL_REACH` is drawn apart and would otherwise widen every query of the world.
 */
function measuredReach(groups: readonly Grouped[], floor: number): number {
  let reach = floor
  for (const worn of groups) {
    for (const mesh of worn.meshes) {
      const measured = worldReach(mesh.geometry, mesh.matrixWorld)
      if (measured <= MAX_SPATIAL_REACH) reach = Math.max(reach, measured)
    }
  }
  return reach
}
function cellGroupState() {
  const index = buildPartition()
  const cells = new Map<CellKey, Held>()
  const placed: Placed = new Map()
  const near: CellKey[] = []
  // Boxes reject 155 of 381 sphere hits measured on 500,000 bodies.
  const boxes = new WeakMap<InstancedMesh, Box3>()
  // Nested maps avoided 2,080 composed-key hashes per pass on 5,000 bodies and 40 shapes.
  const buckets = new Map<string, Map<CellKey | null, Bucket>>()
  return {
    index,
    cells,
    buckets,
    placed,
    sources: heldOutOfDraw(),
    keyOf: withFlags(shapeAndPaint()),
    near,
    standing: new Set<CellKey>(),
    wanted: new Set<CellKey>(),
    boxes,
    owners: new WeakMap<InstancedMesh, Held>(),
    bucketOf: new WeakMap<InstancedMesh, Bucket>(),
    mobiles: new Map<string, Mobile>(),
    promoted: new Set<string>(),
    lotOf: new WeakMap<InstancedMesh, Mobile>(),
  }
}
/**
 * What one cell of one group draws, and the nodes it stands for, index for index. `paint` is the
 * group's own material, held because a promotion happens outside a rebuild and has no group left.
 */
