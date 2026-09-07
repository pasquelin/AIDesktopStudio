import {
  BatchedMesh,
  type BufferGeometry,
  type DataTexture,
  type Material,
  type Mesh,
  type Object3D,
} from 'three'
import './bvhPatches'
import { stableKey } from '@shared/hash'
import { byCodeUnit } from '@shared/text'
import { DEFAULT_OPTIMIZATION_POLICY } from '@shared/domain/optimizationPolicy'
import {
  DRAWN_TRIANGLES,
  heldOutOfDraw,
  refreshMovedSources,
  flagsOf,
  spellingOf,
  sweep,
  trianglesOf,
  widen,
  type Grouped,
  type InstancedGroups,
} from './grouping'
import type { SceneNode } from './sceneState'
import { contentKeyer, MATERIAL_CONTENT } from './resourceContent'

type BatchedSlot = { lot: BatchedMesh; slot: number; source: Mesh }
type BatchedPlaced = Map<string, BatchedSlot[]>

/**
 * Draws every shape wearing one material in one call, whatever the shapes are.
 *
 * One `BatchedMesh` per material instead of one `InstancedMesh` per (geometry, material): the
 * lot holds every geometry of its members in a single buffer and culls and sorts per instance,
 * so a scene of three shapes and eight paints is eight calls where it was twenty-four groups.
 *
 * The meshes are NOT replaced — they are moved to a layer the camera ignores, exactly as
 * `createInstancedGroups` does, so everything that reads `objects` goes on working.
 *
 * 🛑 Measured on this Mac, 2026-09-02, on the real engine: the lot costs MORE CPU than the
 * instance on every scene — three walks every instance of every lot on every pass to cull and
 * sort it, 10.4 ms against 3.1 a frame on 10 000 bodies with one shadow. See RAPPORT-C1.
 */
export function createBatchedGroups(
  host: Object3D,
  ownMaterialOf: (mesh: Mesh) => Material | Material[] = mesh => mesh.material,
): InstancedGroups {
  const drawn: BatchedMesh[] = []
  const sourceMeshes: Mesh[] = []
  /** Where a node's matrix sits, so a move can be written without walking the scene again. */
  const placed: BatchedPlaced = new Map()
  /** The node each slot of each lot stands for — what a hit on the lot resolves to. */
  const members = new WeakMap<BatchedMesh, string[]>()
  /** Whether the lots have trees for a ray to walk. Built on the first pick, not per rebuild. */
  let treesStale = true
  const sources = heldOutOfDraw()

  const clear = (): void => {
    for (const lot of drawn) {
      lot.removeFromParent()
      // three-mesh-bvh throws on a lot that never built its trees, and most never do: a click
      // is what builds them, and a rebuild comes before one more often than not.
      if (!treesStale) lot.disposeBoundsTree()
      lot.dispose()
    }
    drawn.length = 0
    sourceMeshes.length = 0
    placed.clear()
    treesStale = true
  }

  return {
    rebuild: (nodes, objectOf, excluded, artifacts) => {
      clear()
      const keyOf = batchKeyOf(ownMaterialOf)
      const artifactById = new Map(
        artifacts
          ?.filter(artifact => artifact.strategy === 'batch')
          .flatMap(artifact => artifact.sourceIds.map(id => [id, artifact.signature])) ?? [],
      )
      const groupedKey = (node: SceneNode, mesh: Mesh): string =>
        `${keyOf(node, mesh)}|artifact:${artifactById.get(node.id) ?? ''}`

      let batched = 0
      for (const worn of sweep(
        nodes,
        objectOf,
        host,
        ownMaterialOf,
        groupedKey,
        sources,
        excluded,
        artifacts ? DEFAULT_OPTIMIZATION_POLICY.minBatchSize : undefined,
      )) {
        // Pushed one by one: a spread of 200 000 arguments overflows the stack, and a single
        // group of identical bodies reaches that on the levels this engine is measured against.
        for (const mesh of worn.meshes) sourceMeshes.push(mesh)
        const first = worn.meshes[0]
        if (!first) continue
        const { lot, ids, triangles } = buildLot(worn, placed)
        members.set(lot, ids)
        // Read off the source, which `applyShadowFlags` has already written: the sources sit
        // on a layer the shadow camera never looks at.
        lot.castShadow = first.castShadow
        lot.receiveShadow = first.receiveShadow
        // The lot's own bounds are what the frustum tests the whole of it by; per instance,
        // three reads each geometry's own. The box is what a density view measures against.
        lot.computeBoundingSphere()
        lot.computeBoundingBox()
        lot.userData[DRAWN_TRIANGLES] = triangles
        host.add(lot)
        drawn.push(lot)

        batched += worn.meshes.length
      }
      return batched
    },

    moved: (rawIds, objectOf) => {
      const ids = refreshMovedSources(sources, rawIds, objectOf)
      let touched = false
      for (const id of ids) {
        const slots = placed.get(id)
        if (!slots || !objectOf(id)) continue
        for (const at of slots) {
          at.lot.setMatrixAt(at.slot, at.source.matrixWorld)
          // The slot alone rather than the whole texture: `setMatrixAt` flags every matrix of the
          // lot, which is 2.5 MB re-uploaded per pointer move on 40 000 bodies.
          matricesOf(at.lot)?.addUpdateRange(at.slot * 16, 16)
          // Its own bounds, computed if the source never had them: a mesh the camera skipped is a
          // mesh three never measured, and a radius read as 0 lets a dragged lot be culled whole.
          widen(at.lot.boundingSphere, boundedBy(at.source.geometry), at.source.matrixWorld)
          touched = true
        }
      }
      return touched
    },

    drawn: () => drawn,

    pickable: () => {
      if (treesStale) {
        for (const lot of drawn) lot.computeBoundsTree()
        treesStale = false
      }
      return drawn
    },
    editorPickable: () => sourceMeshes,
    editorSourceCount: () => sourceMeshes.length,

    // `batchId` is the field three r185 and three-mesh-bvh both write on a `BatchedMesh` hit.
    nodeIdOf: hit =>
      hit.object instanceof BatchedMesh && hit.batchId !== undefined
        ? (members.get(hit.object)?.[hit.batchId] ?? null)
        : null,

    ...sources.fields(clear),
  }
}

export function batchKeyOf(
  ownMaterialOf: (mesh: Mesh) => Material | Material[] = mesh => mesh.material,
): (node: SceneNode, mesh: Mesh) => string {
  const paintOf = spellingOf(node => (node.type === 'mesh' ? stableKey(node.material) : ''))
  const materialKeyOf = contentKeyer(MATERIAL_CONTENT)
  return (node, mesh) => {
    const material = ownMaterialOf(mesh)
    const paint =
      node.type === 'mesh'
        ? paintOf(node)
        : Array.isArray(material)
          ? ''
          : `material:${materialKeyOf(material)}`
    return `${paint}|${layoutOf(mesh.geometry)}|${flagsOf(node, mesh)}`
  }
}

function buildLot(
  worn: Grouped,
  placed: BatchedPlaced,
): { lot: BatchedMesh; ids: string[]; triangles: number } {
  const { shapes, vertices, indices, triangles } = geometryTotals(worn.meshes)
  const lot = new BatchedMesh(worn.meshes.length, vertices, indices, worn.material)
  lot.perObjectFrustumCulled = true
  lot.sortObjects = true
  const slotOf = new Map([...shapes].map(geometry => [geometry, lot.addGeometry(geometry)]))
  const ids: string[] = []
  for (let at = 0; at < worn.meshes.length; at += 1) {
    const mesh = worn.meshes[at]
    const id = worn.ids[at]
    if (!mesh || id === undefined) continue
    const slot = lot.addInstance(slotOf.get(mesh.geometry) ?? 0)
    lot.setMatrixAt(slot, mesh.matrixWorld)
    const entry = { lot, slot, source: mesh }
    const held = placed.get(id)
    if (held) held.push(entry)
    else placed.set(id, [entry])
    ids[slot] = id
  }
  return { lot, ids, triangles }
}

function geometryTotals(meshes: readonly Mesh[]): {
  shapes: Set<BufferGeometry>
  vertices: number
  indices: number
  triangles: number
} {
  const shapes = new Set<BufferGeometry>()
  let vertices = 0
  let indices = 0
  let triangles = 0
  for (const mesh of meshes) {
    triangles += trianglesOf(mesh.geometry)
    if (shapes.has(mesh.geometry)) continue
    shapes.add(mesh.geometry)
    vertices += mesh.geometry.getAttribute('position')?.count ?? 0
    indices += mesh.geometry.index?.count ?? 0
  }
  return { shapes, vertices, indices, triangles }
}

/** The matrices a lot uploads. `_matricesTexture` is what r185 holds them in and its `.d.ts` hides. */
function matricesOf(lot: BatchedMesh): DataTexture | null {
  // `as`: the field is real and typed by three's own source, only absent from its declarations.
  return (lot as unknown as { _matricesTexture?: DataTexture })._matricesTexture ?? null
}

/** A shape's own bounds, measured on first use: only a drawn mesh has had three measure it. */
function boundedBy(geometry: BufferGeometry): BufferGeometry {
  if (!geometry.boundingSphere) geometry.computeBoundingSphere()
  return geometry
}

const layouts = new WeakMap<BufferGeometry, { attributes: number; layout: string }>()

/**
 * What three demands be the same across a lot: whether there is an index, and which attributes.
 *
 * Held per geometry, and REMEASURED when the attribute count moved: a shared shape is mutated in
 * place when an occlusion map gives it a second UV set, and a stale spelling would group two
 * shapes three refuses to mix — `addGeometry` throws out of `apply`, and nothing catches it.
 */
function layoutOf(geometry: BufferGeometry): string {
  const attributes = Object.keys(geometry.attributes).length
  const known = layouts.get(geometry)
  if (known && known.attributes === attributes) return known.layout

  const spelled = Object.entries(geometry.attributes)
    .map(([name, attribute]) => `${name}:${attribute.itemSize}${attribute.normalized ? 'n' : ''}`)
    .sort(byCodeUnit)
  const layout = `${geometry.index ? 'i' : 'v'}${spelled.join(',')}`
  layouts.set(geometry, { attributes, layout })
  return layout
}
