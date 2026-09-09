import { localizedError } from '@shared/localizedError'
import { BufferAttribute, BufferGeometry } from 'three'
import type { CsgGraph } from '@shared/domain/csg'
import { createRefCache } from '../core/refCache'
import { createWorkerSession } from '../core/workerSession'
import { csgKeyOf } from './csgKey'
import type { CsgMesh, CsgRequest, CsgResponse } from './csgMessage'

export type CsgEvaluator = {
  /**
   * The mesh a graph cuts out, built once however many nodes ask for it. `null` when the
   * evaluation failed, or when the last holder let go while it was still in flight — the caller
   * goes on drawing the raw brushes, which ADR-25 makes the answer rather than an empty scene.
   */
  acquire: (graph: CsgGraph) => Promise<BufferGeometry | null>
  /** Gives a reference back. The geometry is disposed once the last one goes. */
  release: (graph: CsgGraph) => void
  /**
   * Whether this geometry is one the cache lends out. A holder must NEVER dispose one: the same
   * buffers are drawn by every node of the same graph, and freeing them under a neighbour is a
   * solid that vanishes with every gate green.
   */
  owns: (geometry: BufferGeometry) => boolean
  /** The engine is going away: the worker with it, and every geometry it handed out. */
  dispose: () => void
}

export type CsgEvaluatorOptions = {
  spawn: () => Worker
  /**
   * Told when a cut fails, with the KEY of the graph that failed — `reportFailure` dedupes on
   * its subject, so a constant one silences every failure after the first.
   */
  onFailure: (key: string, error: unknown) => void
}

/**
 * Evaluates boolean graphs, and hands out one geometry per distinct graph.
 *
 * Reference counted rather than evicted on a budget — ADR-25 says LRU, and this is narrower:
 * `createRefCache` frees a solid the moment no node points at it any more, which needs no
 * threshold to tune and cannot keep a mesh nobody draws. The ADR is amended by what is written
 * here, not the other way round.
 */
export function createCsgEvaluator({ spawn, onFailure }: CsgEvaluatorOptions): CsgEvaluator {
  const session = createWorkerSession<CsgRequest, CsgResponse>(spawn)
  /** The recipe behind a key, for as long as something holds the mesh it built. */
  const graphs = new Map<string, CsgGraph>()
  const keys = new WeakMap<BufferGeometry, string>()

  const cache = createRefCache<BufferGeometry>({
    load: async key => {
      const graph = graphs.get(key)
      // Unreachable through `acquire`, which records the graph first. Thrown rather than
      // defaulted: a cut of a recipe nobody has is a bug, and a silent empty solid hides it.
      if (!graph) throw localizedError('csgGraphMissing', { name: key })

      const response = await session.send({ id: session.nextId(), graph })
      if (!response.ok) throw new Error(response.error)

      const geometry = geometryOf(response.mesh)
      keys.set(geometry, key)
      return geometry
    },
    free: geometry => {
      const key = keys.get(geometry)
      if (key) graphs.delete(key)
      geometry.dispose()
    },
    // The recipe goes with the failure: `refCache` drops its entry without ever calling `free`,
    // so nothing else would clear it.
    onFailure: (key, error) => {
      graphs.delete(key)
      onFailure(key, error)
    },
  })

  return {
    acquire: graph => {
      const key = csgKeyOf(graph)
      // Before the acquire, never after: `load` runs on the same turn and reads it back.
      graphs.set(key, graph)
      return cache.acquire(key)
    },
    release: graph => cache.release(csgKeyOf(graph)),
    owns: geometry => keys.has(geometry),
    dispose: () => {
      cache.dispose()
      session.dispose()
      graphs.clear()
    },
  }
}

/** The four buffers back into the geometry the scene draws. */
function geometryOf(mesh: CsgMesh): BufferGeometry {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(mesh.position, 3))
  if (mesh.normal.length > 0) geometry.setAttribute('normal', new BufferAttribute(mesh.normal, 3))
  if (mesh.uv.length > 0) geometry.setAttribute('uv', new BufferAttribute(mesh.uv, 2))
  if (mesh.index) geometry.setIndex(new BufferAttribute(mesh.index, 1))
  return geometry
}
