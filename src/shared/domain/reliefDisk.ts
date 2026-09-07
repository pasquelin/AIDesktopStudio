import { clamp } from '../numeric'
import type { HeightmapSamples } from './heightmap'
import { packDeltas, payloadsOf, unpackDeltas } from './reliefPacking'
import type { PackedReliefChunk, ReliefSculpt } from './reliefPacking'
import { chunkCountAlong, chunkLayout, RELIEF_CHUNK_TEXELS, texelStep } from './reliefMetrics'
import type { ReliefChunkLayout, ReliefExtent } from './reliefMetrics'
import type { ReliefMask, ReliefOverlay } from './reliefOverlay'
import { reliefReader } from './reliefRead'
import type { ReliefRead } from './reliefRead'

export type ReliefDisk = { x: number; z: number; radius: number }

type ReliefDiskStroke = {
  disk: ReliefDisk
  amount: number
  /** 0 = hard edge (the historical disk). 1 = linear from full at the centre to none at the rim. */
  falloff?: number
}

/**
 * A sculpt stroke the worker can run. New kinds join this union; they must not grow a second
 * entry point the worker would not see.
 */
export type ReliefSculptOperation =
  | ({ kind: 'raiseDisk' } & ReliefDiskStroke)
  | ({ kind: 'smooth' } & ReliefDiskStroke)
  | ({ kind: 'flatten'; target: number } & ReliefDiskStroke)
  | ({ kind: 'paintMask' } & ReliefDiskStroke)

export type ReliefChunkRows = { from: number; to: number }

export function reliefChunkRowsInDisk(
  samples: HeightmapSamples,
  extent: ReliefExtent,
  disk: { x: number; z: number; radius: number },
  grain: number,
): ReliefChunkRows {
  const span = diskSamples(samples, extent, disk)
  const rows = Array.from({ length: chunkCountAlong(samples.height, grain) }, (_, row) =>
    chunkLayout(0, row, samples.width, samples.height, grain),
  ).filter(layout => {
    const maxZ = layout.sampleZ + layout.height - 1
    return maxZ >= span.minZ && layout.sampleZ <= span.maxZ
  })
  return { from: rows[0]?.row ?? 0, to: (rows.at(-1)?.row ?? 0) + 1 }
}

export function applyReliefSculpt(
  samples: HeightmapSamples,
  extent: ReliefExtent,
  sculpt: ReliefSculpt | undefined,
  operation: ReliefSculptOperation,
  grain = RELIEF_CHUNK_TEXELS,
  rows?: ReliefChunkRows,
  overlays: readonly ReliefOverlay[] = [],
  armed?: { alpha: number; mask?: ReliefMask },
): ReliefSculpt {
  const { disk, amount } = operation
  const falloff = operation.falloff ?? 0
  if (operation.kind === 'raiseDisk') {
    return raiseReliefDisk(samples, extent, sculpt, disk, amount, falloff, grain, rows)
  }
  if (operation.kind === 'smooth') {
    return smoothReliefDisk(
      samples,
      extent,
      sculpt,
      disk,
      amount,
      falloff,
      grain,
      rows,
      overlays,
      armed,
    )
  }
  if (operation.kind === 'flatten') {
    return flattenReliefDisk(
      samples,
      extent,
      sculpt,
      disk,
      operation.target,
      amount,
      falloff,
      grain,
      rows,
      overlays,
      armed,
    )
  }
  return paintReliefMask(samples, extent, sculpt, disk, amount, falloff, grain, rows)
}

export function raiseReliefDisk(
  samples: HeightmapSamples,
  extent: ReliefExtent,
  sculpt: ReliefSculpt | undefined,
  disk: ReliefDisk,
  amount: number,
  falloff = 0,
  grain = RELIEF_CHUNK_TEXELS,
  rows?: ReliefChunkRows,
): ReliefSculpt {
  // No mask here: a raise writes its delta whole, and the overlay's own mask attenuates it at
  // read time — applied at both ends, a painted weight of 0.5 rendered 0.25 and never came back.
  return addDiskDeltas(
    samples,
    extent,
    sculpt,
    disk,
    falloff,
    grain,
    rows,
    (_sx, _sz, weight) => amount * weight,
  )
}

/**
 * Pulls combined height toward the 3×3 neighbourhood mean. The correction is written into
 * `sculpt` so disabling that overlay restores the surface — never mutates the base or others.
 */
export function smoothReliefDisk(
  samples: HeightmapSamples,
  extent: ReliefExtent,
  sculpt: ReliefSculpt | undefined,
  disk: ReliefDisk,
  amount: number,
  falloff = 0,
  grain = RELIEF_CHUNK_TEXELS,
  rows?: ReliefChunkRows,
  overlays: readonly ReliefOverlay[] = [],
  armed?: { alpha: number; mask?: ReliefMask },
): ReliefSculpt {
  const read = combinedRead(samples, grain, overlays, sculpt, extent, armed)
  return addDiskDeltas(samples, extent, sculpt, disk, falloff, grain, rows, (sx, sz, weight) => {
    const combined = read(sx, sz)
    return (neighbourMean(read, samples, sx, sz) - combined) * amount * weight
  })
}

/**
 * Pulls combined height toward `target` (sample space). Same write rule as smooth: the
 * armed overlay holds the correction.
 */
export function flattenReliefDisk(
  samples: HeightmapSamples,
  extent: ReliefExtent,
  sculpt: ReliefSculpt | undefined,
  disk: ReliefDisk,
  target: number,
  amount: number,
  falloff = 0,
  grain = RELIEF_CHUNK_TEXELS,
  rows?: ReliefChunkRows,
  overlays: readonly ReliefOverlay[] = [],
  armed?: { alpha: number; mask?: ReliefMask },
): ReliefSculpt {
  const read = combinedRead(samples, grain, overlays, sculpt, extent, armed)
  return addDiskDeltas(
    samples,
    extent,
    sculpt,
    disk,
    falloff,
    grain,
    rows,
    (sx, sz, weight) => (target - read(sx, sz)) * amount * weight,
  )
}

/** Mixes brush intensity into a painted mask. Rim keeps the previous weight so overlapping dabs hold. */
export function paintReliefMask(
  samples: HeightmapSamples,
  extent: ReliefExtent,
  weights: ReliefSculpt | undefined,
  disk: ReliefDisk,
  amount: number,
  falloff = 0,
  grain = RELIEF_CHUNK_TEXELS,
  rows?: ReliefChunkRows,
): ReliefSculpt {
  return addDiskDeltas(
    samples,
    extent,
    weights,
    disk,
    falloff,
    grain,
    rows,
    () => clamp(amount, 0, 1),
    'mix',
  )
}

function combinedRead(
  samples: HeightmapSamples,
  grain: number,
  overlays: readonly ReliefOverlay[],
  sculpt: ReliefSculpt | undefined,
  extent?: ReliefExtent,
  armed?: { alpha: number; mask?: ReliefMask },
): ReliefRead {
  return reliefReader(
    samples,
    grain,
    [
      ...overlays,
      ...(sculpt ? [{ enabled: true, alpha: armed?.alpha ?? 1, sculpt, mask: armed?.mask }] : []),
    ],
    extent,
  )
}

function neighbourMean(
  read: ReliefRead,
  samples: HeightmapSamples,
  sx: number,
  sz: number,
): number {
  let sum = 0
  let count = 0
  for (let dz = -1; dz <= 1; dz += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const x = sx + dx
      const z = sz + dz
      if (x < 0 || z < 0 || x >= samples.width || z >= samples.height) continue
      sum += read(x, z)
      count += 1
    }
  }
  return count === 0 ? 0 : sum / count
}

export function addDiskDeltas(
  samples: HeightmapSamples,
  extent: ReliefExtent,
  sculpt: ReliefSculpt | undefined,
  disk: ReliefDisk,
  falloff: number,
  grain: number,
  rows: ReliefChunkRows | undefined,
  deltaAt: (sx: number, sz: number, weight: number) => number,
  write: 'add' | 'set' | 'mix' = 'add',
): ReliefSculpt {
  const span = diskSamples(samples, extent, disk)
  const distanceX = Float64Array.from({ length: span.maxX - span.minX + 1 }, (_, at) => {
    const dx = extent.origin.x + (span.minX + at) * span.stepX - disk.x
    return dx * dx
  })
  const distanceZ = Float64Array.from({ length: span.maxZ - span.minZ + 1 }, (_, at) => {
    const dz = extent.origin.z + (span.minZ + at) * span.stepZ - disk.z
    return dz * dz
  })
  const updated = new Map<string, PackedReliefChunk>()
  const touched = new Set<string>()
  const packed = payloadsOf(sculpt)
  const rowFrom = rows?.from ?? 0
  const rowTo = rows?.to ?? chunkCountAlong(samples.height, grain)
  const context = {
    samples,
    span,
    disk,
    falloff,
    grain,
    distanceX,
    distanceZ,
    packed,
    deltaAt,
    write,
  }
  for (let row = rowFrom; row < rowTo; row += 1) {
    for (let column = 0; column < chunkCountAlong(samples.width, grain); column += 1) {
      const key = `${column}:${row}`
      const payload = raisedChunk(context, column, row, key)
      if (payload === null) continue
      touched.add(key)
      if (payload !== '') updated.set(key, { column, row, payload })
    }
  }
  const chunks = (sculpt?.chunks ?? []).flatMap(chunk => {
    const key = `${chunk.column}:${chunk.row}`
    const replacement = updated.get(key)
    updated.delete(key)
    return replacement ? [replacement] : touched.has(key) ? [] : [chunk]
  })
  return { chunks: [...chunks, ...updated.values()] }
}

type RaiseContext = {
  samples: HeightmapSamples
  span: ReturnType<typeof diskSamples>
  disk: ReliefDisk
  falloff: number
  grain: number
  distanceX: Float64Array
  distanceZ: Float64Array
  packed: ReadonlyMap<string, PackedReliefChunk>
  deltaAt: (sx: number, sz: number, weight: number) => number
  write: 'add' | 'set' | 'mix'
}

function raisedChunk(
  context: RaiseContext,
  column: number,
  row: number,
  key: string,
): string | null {
  const { samples, grain, span } = context
  const layout = chunkLayout(column, row, samples.width, samples.height, grain)
  const maxX = layout.sampleX + layout.width - 1
  const maxZ = layout.sampleZ + layout.height - 1
  if (
    maxX < span.minX ||
    layout.sampleX > span.maxX ||
    maxZ < span.minZ ||
    layout.sampleZ > span.maxZ
  ) {
    return null
  }
  const held = context.packed.get(key)
  const deltas = held
    ? unpackDeltas(held.payload, layout.width * layout.height)
    : new Float32Array(layout.width * layout.height)
  raiseChunkSamples(context, layout, deltas, maxX, maxZ)
  return packDeltas(deltas)
}

function raiseChunkSamples(
  context: RaiseContext,
  layout: ReliefChunkLayout,
  deltas: Float32Array,
  maxX: number,
  maxZ: number,
): void {
  const { span, disk, distanceX, distanceZ, falloff, deltaAt, write } = context
  for (let sz = Math.max(span.minZ, layout.sampleZ); sz <= Math.min(span.maxZ, maxZ); sz += 1) {
    for (let sx = Math.max(span.minX, layout.sampleX); sx <= Math.min(span.maxX, maxX); sx += 1) {
      const d2 = (distanceX[sx - span.minX] ?? Infinity) + (distanceZ[sz - span.minZ] ?? Infinity)
      if (d2 > disk.radius * disk.radius) continue
      const at = (sz - layout.sampleZ) * layout.width + (sx - layout.sampleX)
      const weight = falloff <= 0 ? 1 : diskFalloff(Math.sqrt(d2), disk.radius, falloff)
      const next = deltaAt(sx, sz, weight)
      const held = deltas[at] ?? 0
      deltas[at] =
        write === 'mix' ? held + (next - held) * weight : write === 'set' ? next : held + next
    }
  }
}

function diskSamples(
  samples: HeightmapSamples,
  extent: ReliefExtent,
  disk: { x: number; z: number; radius: number },
): { minX: number; maxX: number; minZ: number; maxZ: number; stepX: number; stepZ: number } {
  const { x: stepX, z: stepZ } = texelStep(extent.size, samples)
  return {
    stepX,
    stepZ,
    minX: clampIndex(Math.floor((disk.x - disk.radius - extent.origin.x) / stepX), samples.width),
    maxX: clampIndex(Math.ceil((disk.x + disk.radius - extent.origin.x) / stepX), samples.width),
    minZ: clampIndex(Math.floor((disk.z - disk.radius - extent.origin.z) / stepZ), samples.height),
    maxZ: clampIndex(Math.ceil((disk.z + disk.radius - extent.origin.z) / stepZ), samples.height),
  }
}

function clampIndex(at: number, samples: number): number {
  return clamp(at, 0, samples - 1)
}

function diskFalloff(distance: number, radius: number, falloff: number): number {
  if (falloff <= 0 || radius <= 0) return 1
  const t = distance / radius
  const start = 1 - clamp(falloff, 0, 1)
  if (t <= start) return 1
  return 1 - (t - start) / (1 - start)
}
