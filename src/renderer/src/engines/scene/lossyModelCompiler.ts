import type { BufferGeometry, Object3D } from 'three'
import type {
  CompiledMeshGeometry,
  CompiledModelMesh,
  LossyOptimization,
} from '@shared/domain/gameExport'
import { DEFAULT_OPTIMIZATION_POLICY } from '@shared/domain/optimizationPolicy'
import { createWorkerPort } from '../core/workerPort'
import { workerPoolSize } from '../core/workerPoolSize'
import { createGltfSource } from './gltfSource'
import { compiledMeshOf } from './compiledGeometry'
import LossyModelWorker from './lossyModel.worker?worker'
import {
  buffersOfGeometry,
  geometryOfBuffers,
  transferablesOfBuffers,
  type LossyModelResponse,
} from './lossyModelMessage'
import { disposeTree } from './modelCache'
import { analyzeModelOptimization, type ModelOptimizationCandidate } from './worldAnalyzer'

type LossyModelPorts = {
  load: (url: string, signal: AbortSignal | undefined) => Promise<Object3D | null>
  /** One upload, one geometry per ratio: re-uploading the source per level copied it each time. */
  simplify: (
    geometry: BufferGeometry,
    ratios: readonly number[],
    signal: AbortSignal | undefined,
  ) => Promise<readonly BufferGeometry[] | null>
  /** How many models may be in flight at once: the worker count behind `simplify`. */
  concurrency?: number
  dispose: () => void
}

/** How a caller stops this pass and follows it — the shape `LossyTextureWatch` takes next door. */
export type LossyModelWatch = {
  signal?: AbortSignal
  onProgress?: (completed: number, total: number) => void
}

const aborted = (): DOMException => new DOMException('Model compilation aborted', 'AbortError')

export async function compileLossyModels(
  assets: readonly { id: string; url: string }[],
  options: LossyOptimization,
  watch: LossyModelWatch = {},
  ports?: LossyModelPorts,
): Promise<ReadonlyMap<string, readonly CompiledModelMesh[]>> {
  if (!options.generateLods && options.geometrySimplification === 'off') return new Map()

  const signal = watch.signal
  const active = ports ?? browserModelPorts()
  const unique = uniqueAssets(assets)
  const compiled = new Map<string, readonly CompiledModelMesh[]>()
  let next = 0
  let completed = 0

  const lane = async (): Promise<void> => {
    while (next < unique.length) {
      const index = next
      next += 1
      const asset = unique[index]
      if (!asset) continue
      if (signal?.aborted) throw aborted()
      const root = await active.load(asset.url, signal)
      if (signal?.aborted) {
        if (root) disposeTree(root)
        throw aborted()
      }
      if (root) await compileAsset(asset.id, root, options, signal, active, compiled)
      completed += 1
      watch.onProgress?.(completed, unique.length)
    }
  }

  try {
    const lanes = Math.max(1, Math.min(active.concurrency ?? 1, unique.length))
    // Settled rather than raced: several lanes reject on the same abort, and a rejection nobody
    // reads kills the process.
    for (const settled of await Promise.allSettled(Array.from({ length: lanes }, lane))) {
      if (settled.status === 'rejected') throw settled.reason
    }
    return compiled
  } finally {
    active.dispose()
  }
}

async function compileAsset(
  assetId: string,
  root: Object3D,
  options: LossyOptimization,
  signal: AbortSignal | undefined,
  active: LossyModelPorts,
  compiled: Map<string, readonly CompiledModelMesh[]>,
): Promise<void> {
  try {
    const meshes: CompiledModelMesh[] = []
    for (const candidate of analyzeModelOptimization(root, options.generateLods)) {
      const plan = await compiledModelMesh(candidate, options, signal, active.simplify)
      if (plan) meshes.push(plan)
    }
    if (meshes.length > 0) compiled.set(assetId, meshes)
  } finally {
    disposeTree(root)
  }
}

function uniqueAssets(assets: readonly { id: string; url: string }[]): readonly {
  id: string
  url: string
}[] {
  return [...new Map(assets.map(asset => [asset.id, asset])).values()]
}

async function compiledModelMesh(
  candidate: ModelOptimizationCandidate,
  options: LossyOptimization,
  signal: AbortSignal | undefined,
  simplify: LossyModelPorts['simplify'],
): Promise<CompiledModelMesh | null> {
  const ratio = DEFAULT_OPTIMIZATION_POLICY.simplificationRatios[options.geometrySimplification]
  const ratios = options.generateLods
    ? DEFAULT_OPTIMIZATION_POLICY.lodSimplificationRatios.map(level => Math.max(level, ratio))
    : [ratio]
  const reduced = await simplify(candidate.geometry, ratios, signal)
  if (!reduced || reduced.length !== ratios.length) return null

  const levels: CompiledMeshGeometry[] = reduced.map(compiledMeshOf)
  for (const geometry of reduced) geometry.dispose()
  if (options.generateLods) return { meshIndex: candidate.meshIndex, lodMeshes: levels }
  const geometry = levels[0]
  return geometry ? { meshIndex: candidate.meshIndex, geometry } : null
}

function browserModelPorts(): LossyModelPorts {
  const source = createGltfSource(() => null)
  const size = workerPoolSize()
  const ports = Array.from({ length: size }, () =>
    createWorkerPort<readonly BufferGeometry[], LossyModelResponse>(
      () => new LossyModelWorker(),
      'lossy model',
      answer => answer.geometries.map(geometryOfBuffers),
    ),
  )
  const disposeAll = (): void => ports.forEach(port => port.dispose())
  let turn = 0

  return {
    load: async (url, signal) => {
      try {
        const response = await fetch(url, { signal })
        if (!response.ok) return null
        const bytes = await response.arrayBuffer()
        if (signal?.aborted) throw aborted()
        return source.parse ? await source.parse(bytes, url) : await source.load(url)
      } catch {
        if (signal?.aborted) throw aborted()
        // Missing or unsupported models remain original and are reported by the package writer.
        return null
      }
    },
    simplify: async (geometry, ratios, signal) => {
      const buffers = buffersOfGeometry(geometry, true)
      if (!buffers) return null
      const chosen = ports[turn % ports.length]
      turn += 1
      if (!chosen) return null
      // Kept for the life of the signal: `addEventListener` ignores a repeat of the same
      // listener, and removing it in one lane's `finally` would disarm the others.
      signal?.addEventListener('abort', disposeAll, { once: true })
      return await chosen.send(
        id => ({
          message: { id, geometry: buffers, ratios },
          transfer: transferablesOfBuffers([buffers]),
        }),
        { signal },
      )
    },
    concurrency: size,
    dispose: () => {
      disposeAll()
      source.dispose()
    },
  }
}
