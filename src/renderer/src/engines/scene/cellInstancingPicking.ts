import type { InstancedMesh, Mesh } from 'three'
import type { Bucket, Mobile } from './cellInstancingGeometry'
import type { Grouped } from './grouping'
import type { CellKey } from './worldPartition'

/** The source meshes of each node, by id — a model contributes one per primitive. */
export function sourcesByNode(groups: readonly Grouped[]): ReadonlyMap<string, Mesh[]> {
  const byNode = new Map<string, Mesh[]>()
  for (const group of groups) {
    for (const [at, mesh] of group.meshes.entries()) {
      const id = group.ids[at]
      if (id === undefined) continue
      const kept = byNode.get(id)
      if (kept) kept.push(mesh)
      else byNode.set(id, [mesh])
    }
  }
  return byNode
}

/**
 * The sources of what the view STANDS, which is what the editor may pick. A cell the follow put
 * away draws nothing, and a ray that met its bodies would select over empty space.
 */
export function standingSources(
  buckets: Iterable<Bucket>,
  standing: ReadonlySet<CellKey>,
  movers: Iterable<Mobile>,
  sourcesById: ReadonlyMap<string, Mesh[]>,
): readonly Mesh[] {
  const meshes: Mesh[] = []
  // Once per node: a bucket names a MODEL once per primitive, so taking its sources per id would
  // hand the picker each of them squared.
  const taken = new Set<string>()
  const take = (ids: readonly string[]): void => {
    for (const id of ids) {
      if (taken.has(id)) continue
      taken.add(id)
      for (const mesh of sourcesById.get(id) ?? []) meshes.push(mesh)
    }
  }
  for (const bucket of buckets) {
    if (bucket.cell === null || standing.has(bucket.cell)) take(bucket.ids)
  }
  for (const mover of movers) take(mover.ids)
  return meshes
}

/** The lots the view STANDS — the runtime representation, against the sources above. */
export function standingLots(
  buckets: Iterable<Bucket>,
  standing: ReadonlySet<CellKey>,
  movers: Iterable<Mobile>,
): InstancedMesh[] {
  const lots = [...movers].map(lot => lot.mesh)
  for (const bucket of buckets) {
    if (bucket.cell === null || standing.has(bucket.cell)) lots.push(bucket.mesh)
  }
  return lots
}

/** What `standingSources` would return, counted over the buckets rather than materialised. */
export function standingSourceCount(
  buckets: Iterable<Bucket>,
  standing: ReadonlySet<CellKey>,
  movers: Iterable<Mobile>,
): number {
  let count = 0
  for (const bucket of buckets) {
    if (bucket.cell === null || standing.has(bucket.cell)) count += bucket.ids.length
  }
  for (const mover of movers) count += mover.ids.length
  return count
}

/** The three readings a click makes of the cells, which only differ by what they materialise. */
export function cellPicking(
  buckets: () => Iterable<Bucket>,
  standing: ReadonlySet<CellKey>,
  // The MAP, never `values()`: an iterator is walked once, and the second click read no mover.
  movers: ReadonlyMap<string, Mobile>,
  sourcesById: () => ReadonlyMap<string, Mesh[]>,
) {
  return {
    pickable: () => standingLots(buckets(), standing, movers.values()),
    editorPickable: () => standingSources(buckets(), standing, movers.values(), sourcesById()),
    editorSourceCount: () => standingSourceCount(buckets(), standing, movers.values()),
  }
}
