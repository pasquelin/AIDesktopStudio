import type { ExportedAssetOverride, LossyOptimization } from '@shared/domain/gameExport'
import { DEFAULT_OPTIMIZATION_POLICY } from '@shared/domain/optimizationPolicy'
import { fetchOriginalAsset } from '@/helpers/assetFetch'
import { createWorkerPort } from '../core/workerPort'
import { workerPoolSize } from '../core/workerPoolSize'
import LossyTextureWorker from './lossyTexture.worker?worker'
import type { LossyTextureResponse, TextureEncoding } from './lossyTextureMessage'
import { optimizedGlbTextures, type EmbeddedTextureTransform } from './lossyGlbTextures'

export type LossyTextureWatch = {
  signal?: AbortSignal
  onProgress?: (completed: number, total: number) => void
}

type TextureCompilerPorts = {
  read: (assetId: string, signal: AbortSignal | undefined) => Promise<Uint8Array | null>
  transform: (
    assetId: string,
    bytes: Uint8Array,
    scale: number,
    encoding: TextureEncoding,
    signal: AbortSignal | undefined,
  ) => Promise<ExportedAssetOverride | null>
  /** How many transforms may be in flight at once: the worker count behind `transform`. */
  concurrency?: number
  dispose?: () => void
}

/** What an asset's bytes become: a reduced image, or a container whose images were reduced. */
type AssetOptimizer = (
  assetId: string,
  bytes: Uint8Array,
  reduce: EmbeddedTextureTransform,
) => Promise<ExportedAssetOverride | null>

const aborted = (): DOMException => new DOMException('Texture compilation aborted', 'AbortError')

export function compileLossyTextures(
  assetIds: readonly string[],
  options: LossyOptimization,
  watch: LossyTextureWatch = {},
  ports?: TextureCompilerPorts,
): Promise<readonly ExportedAssetOverride[]> {
  return compiledOverrides(assetIds, options, watch, ports, (assetId, bytes, reduce) =>
    reduce(assetId, bytes),
  )
}

export function compileLossyModelTextures(
  assetIds: readonly string[],
  options: LossyOptimization,
  watch: LossyTextureWatch = {},
  ports?: TextureCompilerPorts,
): Promise<readonly ExportedAssetOverride[]> {
  return compiledOverrides(assetIds, options, watch, ports, optimizedGlbTextures)
}

async function compiledOverrides(
  assetIds: readonly string[],
  options: LossyOptimization,
  watch: LossyTextureWatch,
  ports: TextureCompilerPorts | undefined,
  optimize: AssetOptimizer,
): Promise<readonly ExportedAssetOverride[]> {
  if (options.textureReduction === 'off' && options.textureCompression === 'off') return []

  const encoding = textureEncoding(options)
  const scale = DEFAULT_OPTIMIZATION_POLICY.textureScale[options.textureReduction]
  const found: (ExportedAssetOverride | null)[] = assetIds.map(() => null)
  const active = ports ?? acquireTexturePorts()
  let next = 0
  let completed = 0

  const lane = async (): Promise<void> => {
    while (next < assetIds.length) {
      const index = next
      next += 1
      const assetId = assetIds[index]
      if (assetId === undefined) continue
      if (watch.signal?.aborted) throw aborted()
      const bytes = await active.read(assetId, watch.signal)
      if (watch.signal?.aborted) throw aborted()
      if (bytes) {
        found[index] = await optimize(assetId, bytes, (id, source) =>
          active.transform(id, source, scale, encoding, watch.signal),
        )
      }
      completed += 1
      watch.onProgress?.(completed, assetIds.length)
    }
  }

  try {
    const lanes = Math.max(1, Math.min(active.concurrency ?? 1, assetIds.length))
    // Settled rather than raced: several lanes reject on the same abort, and a rejection nobody
    // reads kills the process.
    for (const settled of await Promise.allSettled(Array.from({ length: lanes }, lane))) {
      if (settled.status === 'rejected') throw settled.reason
    }
    return found.flatMap(override => (override ? [override] : []))
  } finally {
    if (ports) ports.dispose?.()
    else releaseTexturePorts()
  }
}

function textureEncoding(options: LossyOptimization): TextureEncoding {
  if (options.textureCompression === 'off') return { format: 'png' }
  return {
    format: 'jpg',
    quality: DEFAULT_OPTIMIZATION_POLICY.jpegQuality[options.textureCompression] / 100,
  }
}

let shared: { ports: TextureCompilerPorts; users: number } | null = null

/** One pool for one export: both entry points above run inside the same `Promise.all`. */
function acquireTexturePorts(): TextureCompilerPorts {
  const held = shared ?? { ports: browserTexturePorts(), users: 0 }
  held.users += 1
  shared = held
  return held.ports
}

function releaseTexturePorts(): void {
  if (!shared) return
  shared.users -= 1
  if (shared.users > 0) return
  shared.ports.dispose?.()
  shared = null
}

function browserTexturePorts(): TextureCompilerPorts {
  const size = workerPoolSize()
  const ports = Array.from({ length: size }, () =>
    createWorkerPort<ExportedAssetOverride | undefined, LossyTextureResponse>(
      () => new LossyTextureWorker(),
      'lossy texture',
      answer => answer.override,
    ),
  )
  const disposeAll = (): void => ports.forEach(port => port.dispose())
  let turn = 0

  return {
    read: async (assetId, signal) => {
      try {
        return new Uint8Array(await (await fetchOriginalAsset(assetId, signal)).arrayBuffer())
      } catch {
        // The package writer reports missing catalogue assets; optimization must not mask that report.
        return null
      }
    },
    transform: async (assetId, bytes, scale, encoding, signal) => {
      const port = ports[turn % ports.length]
      turn += 1
      if (!port) return null
      // Kept for the life of the signal: `addEventListener` ignores a repeat of the same
      // listener, and removing it in one lane's `finally` would disarm the others.
      signal?.addEventListener('abort', disposeAll, { once: true })
      return (
        (await port.send(
          id => ({
            message: {
              id,
              assetId,
              bytes,
              scale,
              format: encoding.format,
              ...(encoding.quality === undefined ? {} : { quality: encoding.quality }),
            },
            transfer: [bytes.buffer],
          }),
          { signal },
        )) ?? null
      )
    },
    concurrency: size,
    dispose: disposeAll,
  }
}
