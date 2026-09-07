import { Mesh, type Intersection, type Material, type Object3D } from 'three'
import { createBatchedGroups } from './batching'
import { createCellGroups } from './cellInstancing'
import { createMergedGroups } from './mergedGrouping'
import type { InstancedGroups, RuntimeRenderArtifact } from './grouping'
import { meshesOf } from './instanceableModel'

/**
 * Above this many sources the editor casts against the LOTS, `nodeIdOf` naming the node by slot.
 * Measured 2026-09-04, medians of five runs: 5.069 ms → 2.291 at 25 000 targets, 12.019 → 4.771
 * at 50 000. Below it the sources answer by object identity, which no slot has to stand for.
 */
export const RUNTIME_PICKING_THRESHOLD = 25_000

export type EditorPickingGroup = Pick<
  InstancedGroups,
  'editorPickable' | 'editorSourceCount' | 'pickable'
>

export function editorPickingTargets(groups: readonly EditorPickingGroup[]): readonly Mesh[] {
  const sourceCount = groups.reduce((total, group) => total + group.editorSourceCount(), 0)
  const targets: Mesh[] = []
  for (const group of groups) {
    const meshes =
      sourceCount < RUNTIME_PICKING_THRESHOLD ? group.editorPickable() : group.pickable()
    for (const mesh of meshes) targets.push(mesh)
  }
  return targets
}

export function createOptimizedGroups(
  host: Object3D,
  ownMaterialOf: (mesh: Mesh) => Material | Material[] = mesh => mesh.material,
): InstancedGroups {
  const instances = createCellGroups(host, ownMaterialOf)
  const batches = createBatchedGroups(host, ownMaterialOf)
  const merges = createMergedGroups(host, ownMaterialOf)
  const pickingGroups = [instances, batches, merges]

  return {
    rebuild: (nodes, objectOf, excluded, artifacts) => {
      instances.hangSources()
      batches.hangSources()
      merges.hangSources()
      for (const node of nodes) {
        const object = objectOf(node.id)
        if (object instanceof Mesh) object.layers.set(0)
        else if (object) for (const mesh of meshesOf(object)) mesh.layers.set(0)
      }
      const modeById = new Map(nodes.map(node => [node.id, node.optimization?.mode ?? 'auto']))
      const compiled = selectionsOf(artifacts)
      const picked = (id: string, chosen: boolean): Object3D | undefined =>
        chosen ? objectOf(id) : undefined
      const forInstances = (id: string): Object3D | undefined =>
        picked(
          id,
          compiled
            ? compiled.instances.has(id)
            : modeById.get(id) === 'auto' || modeById.get(id) === 'instance',
        )
      const forBatches = (id: string): Object3D | undefined =>
        picked(id, compiled ? compiled.batches.has(id) : modeById.get(id) === 'batch')
      const forMerges = (id: string): Object3D | undefined =>
        picked(id, compiled?.merges.has(id) ?? false)
      const grouped =
        instances.rebuild(nodes, forInstances, excluded) +
        batches.rebuild(nodes, forBatches, excluded, artifacts) +
        merges.rebuild(nodes, forMerges, excluded, artifacts)
      instances.dropSources()
      batches.dropSources()
      merges.dropSources()
      return grouped
    },
    // The three are ASKED, never short-circuited: a merged group bakes world matrices into its
    // geometry, so it has to rebuild whenever a member moves — whatever the other two answered.
    moved: (ids, objectOf) => {
      const movedIds = [...ids]
      const movedInstances = instances.moved(movedIds, objectOf)
      const movedBatches = batches.moved(movedIds, objectOf)
      const movedMerges = merges.moved(movedIds, objectOf)
      return movedInstances || movedBatches || movedMerges
    },
    drawn: () => [...instances.drawn(), ...batches.drawn(), ...merges.drawn()],
    pickable: () => [...instances.pickable(), ...batches.pickable(), ...merges.pickable()],
    editorPickable: () => editorPickingTargets(pickingGroups),
    editorSourceCount: () => instances.editorSourceCount() + batches.editorSourceCount(),
    nodeIdOf: (hit: Intersection) =>
      instances.nodeIdOf(hit) ?? batches.nodeIdOf(hit) ?? merges.nodeIdOf(hit),
    hangSources: () => {
      instances.hangSources()
      batches.hangSources()
      merges.hangSources()
    },
    dropSources: () => {
      instances.dropSources()
      batches.dropSources()
      merges.dropSources()
    },
    refreshSources: () => {
      instances.refreshSources()
      batches.refreshSources()
      merges.refreshSources()
    },
    holdsSource: object =>
      instances.holdsSource(object) || batches.holdsSource(object) || merges.holdsSource(object),
    follow: (camera, cast) => instances.follow?.(camera, cast) ?? false,
    builtAnew: () => instances.builtAnew?.() ?? false,
    stats: () =>
      instances.stats?.() ?? {
        nodesVisited: 0,
        cellsReturned: 0,
        cellsStanding: 0,
        cells: 0,
        bytes: 0,
      },
    dispose: () => {
      instances.dispose()
      batches.dispose()
      merges.dispose()
    },
  }
}

function selectionsOf(artifacts: readonly RuntimeRenderArtifact[] | undefined): {
  instances: ReadonlySet<string>
  batches: ReadonlySet<string>
  merges: ReadonlySet<string>
} | null {
  if (!artifacts) return null
  const instances = new Set<string>()
  const batches = new Set<string>()
  const merges = new Set<string>()
  for (const artifact of artifacts) {
    const target =
      artifact.strategy === 'instance'
        ? instances
        : artifact.strategy === 'batch'
          ? batches
          : merges
    for (const id of artifact.sourceIds) target.add(id)
  }
  return { instances, batches, merges }
}
