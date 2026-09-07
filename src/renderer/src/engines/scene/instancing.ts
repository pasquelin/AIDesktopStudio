import { InstancedMesh, type BufferGeometry, type Material, type Mesh, type Object3D } from 'three'
import { TRIANGLES_PER_REGION, regionsByGrid, type SpatialRegions } from './instanceRegions'
import {
  heldOutOfDraw,
  refreshMovedSources,
  shapeAndPaint,
  withFlags,
  trianglesOf,
  pushSlot,
  sweep,
  writeMoved,
  type Grouped,
  type InstancedGroups,
  type Placed,
} from './grouping'
import type { SceneNode } from './sceneState'

/**
 * Draws repeated shapes in one call instead of one each.
 *
 * The matrices go into a `Float32Array`, where a mesh's own are doubles — measured, that costs
 * 0.30 mm of drift at 10 000 units from the origin and 3.1 mm at 100 000, so a camera-relative
 * frame buys nothing at any distance a level reaches.
 *
 * The meshes are NOT replaced — they are moved to a layer the camera ignores. Everything that
 * reads `objects` goes on working, and what it buys was measured on this Mac at 1600×900, on
 * 10 000 shadowed spheres: a tight view fell from 12.4 ms and 9 566 draw calls to 3.7 ms and 40,
 * a wide one from 24.4 ms and 19 411 calls to 4.3 ms and 73.
 */
export function createInstancedGroups(
  host: Object3D,
  /**
   * What a mesh wears when no view has dressed it. A display mode REPLACES a material, so an
   * instance built during one would be born wearing the stand-in — and would keep it when the
   * view went back, since nothing remembers a material for an object that did not exist yet.
   */
  ownMaterialOf: (mesh: Mesh) => Material | Material[] = mesh => mesh.material,
): InstancedGroups {
  const drawn: InstancedMesh[] = []
  const sourceMeshes: Mesh[] = []
  const placed: Placed = new Map()
  const idsByInstance = new WeakMap<InstancedMesh, string[]>()
  const sources = heldOutOfDraw()
  const keyOf = withFlags(shapeAndPaint())

  const clear = (): void => {
    for (const instance of drawn) {
      instance.removeFromParent()
      instance.dispose()
    }
    drawn.length = 0
    sourceMeshes.length = 0
    placed.clear()
  }

  return {
    rebuild: (nodes, objectOf, excluded) => {
      clear()

      let instanced = 0
      for (const worn of sweep(nodes, objectOf, host, ownMaterialOf, keyOf, sources, excluded)) {
        // Pushed one by one: a spread of 200 000 arguments overflows the stack, and a single
        // group of identical bodies reaches that on the levels this engine is measured against.
        for (const mesh of worn.meshes) sourceMeshes.push(mesh)
        const first = worn.meshes[0]
        if (!first) continue
        buildRegions(worn, first, placed, host, drawn, idsByInstance)
        instanced += worn.meshes.length
      }
      return instanced
    },

    moved: (ids, objectOf) =>
      writeMoved(placed, refreshMovedSources(sources, ids, objectOf), objectOf),

    drawn: () => drawn,

    pickable: () => drawn,
    editorPickable: () => sourceMeshes,
    editorSourceCount: () => sourceMeshes.length,

    nodeIdOf: hit => {
      if (!(hit.object instanceof InstancedMesh) || hit.instanceId === undefined) return null
      return idsByInstance.get(hit.object)?.[hit.instanceId] ?? null
    },

    ...sources.fields(clear),
  }
}

function buildRegions(
  worn: Grouped,
  first: Mesh,
  placed: Placed,
  host: Object3D,
  drawn: InstancedMesh[],
  idsByInstance: WeakMap<InstancedMesh, string[]>,
): void {
  const regions = splitOf(worn, first.geometry)
  for (let region = 0; region + 1 < regions.starts.length; region += 1) {
    const { instance, ids } = buildRegion(worn, regions, region, first, placed)
    host.add(instance)
    drawn.push(instance)
    idsByInstance.set(instance, ids)
  }
}

function buildRegion(
  worn: Grouped,
  regions: SpatialRegions,
  region: number,
  first: Mesh,
  placed: Placed,
): { instance: InstancedMesh; ids: string[] } {
  const from = regions.starts[region] ?? 0
  const to = regions.starts[region + 1] ?? 0
  const instance = new InstancedMesh(first.geometry, worn.material, to - from)
  const ids: string[] = []
  let written = 0
  for (let slot = from; slot < to; slot += 1) {
    const at = regions.order[slot] ?? -1
    const mesh = worn.meshes[at]
    const id = worn.ids[at]
    if (!mesh || id === undefined) continue
    instance.setMatrixAt(written, mesh.matrixWorld)
    pushSlot(placed, id, { instance, slot: written, source: mesh })
    ids[written] = id
    written += 1
  }
  instance.count = written
  instance.castShadow = first.castShadow
  instance.receiveShadow = first.receiveShadow
  instance.instanceMatrix.needsUpdate = true
  instance.computeBoundingSphere()
  return { instance, ids }
}

/**
 * The regions this group is drawn in — one holding everything when all of it together draws
 * fewer triangles than a region is worth.
 */
function splitOf({ meshes }: Grouped, geometry: BufferGeometry): SpatialRegions {
  const cells = Math.ceil((meshes.length * trianglesOf(geometry)) / TRIANGLES_PER_REGION)
  if (cells <= 1) {
    return { order: Uint32Array.from(meshes.keys()), starts: Uint32Array.of(0, meshes.length) }
  }

  // The translation read straight off the world matrix, never `decompose`: a non-uniform scale
  // inside a rotated parent shears, and a decomposed translation of a sheared matrix drifts.
  const at = new Float64Array(meshes.length * 3)
  for (const [slot, mesh] of meshes.entries()) {
    const stands = mesh.matrixWorld.elements
    at[slot * 3] = stands[12] ?? 0
    at[slot * 3 + 1] = stands[13] ?? 0
    at[slot * 3 + 2] = stands[14] ?? 0
  }
  return regionsByGrid({ at, count: meshes.length }, cells)
}

/**
 * Whether a node still belongs to the group it was in: everything a draw call is grouped by is
 * the same object it was, and only where the node stands has moved.
 *
 * Compared by REFERENCE, which the store makes meaningful — a node is replaced when it is
 * edited. A move that rebuilt the groups cost 32.7 ms on 40 000 nodes, per pointer move.
 */
export function keepsItsGroup(previous: SceneNode, node: SceneNode): boolean {
  if (previous.type === 'model' && node.type === 'model') {
    return (
      previous.model.assetId === node.model.assetId &&
      previous.model.dress === node.model.dress &&
      previous.visible === node.visible &&
      previous.parentId === node.parentId &&
      previous.optimization === node.optimization &&
      previous.castShadow === node.castShadow &&
      previous.receiveShadow === node.receiveShadow
    )
  }
  return (
    previous.type === 'mesh' &&
    node.type === 'mesh' &&
    previous.geometry === node.geometry &&
    previous.material === node.material &&
    previous.instances === node.instances &&
    previous.visible === node.visible &&
    previous.parentId === node.parentId &&
    previous.optimization === node.optimization &&
    // The shadow flags and the tool mark are part of the group key: an instance carries one of
    // each, so a node that changed its mind has to leave the group rather than keep its slot.
    previous.castShadow === node.castShadow &&
    previous.receiveShadow === node.receiveShadow &&
    previous.negative === node.negative
  )
}
