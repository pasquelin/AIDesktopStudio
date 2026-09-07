/**
 * How a relief heightmap is cut into chunks. Grain 64 rather than 128: a full-chunk fallback
 * uploads four times less — `reliefChunkCost.test.ts`. A 4K map would want 128 instead.
 */
import { clamp } from '../numeric'
import type { HeightmapSamples } from './heightmap'
import { packDeltas, payloadsOf, unpackDeltas } from './reliefPacking'
import type { PackedReliefChunk, ReliefSculpt } from './reliefPacking'
import { readReliefGrain as readGrain } from './reliefParsing'
import { chunkLayout, RELIEF_CHUNK_TEXELS, texelStep, worldY } from './reliefMetrics'
import type { ReliefChunkKey, ReliefExtent } from './reliefMetrics'
import type { ReliefOverlay } from './reliefOverlay'
import { reliefReader } from './reliefRead'

export { packDeltas, unpackDeltas, payloadsOf } from './reliefPacking'
export type { PackedReliefChunk, ReliefSculpt } from './reliefPacking'
export { readReliefSculpt, readReliefMask } from './reliefParsing'
export * from './reliefMetrics'
export * from './reliefOverlay'
export * from './reliefRead'

/** Whether (x, z) sits on the rectangle, edges included. Outside is false — never clamped in. */
export function containsXZ(extent: ReliefExtent, x: number, z: number): boolean {
  return (
    x >= extent.origin.x &&
    x <= extent.origin.x + extent.size.x &&
    z >= extent.origin.z &&
    z <= extent.origin.z + extent.size.z
  )
}

/**
 * A height query: the spatial half of a relief plus the samples the heightmap asset holds.
 * `ReliefLayer` matches this shape once `samples` is attached — the asset stays a `TextureRef`.
 */
export type ReliefHeightLayer = ReliefExtent & {
  enabled: boolean
  grain: number
  edits: readonly ReliefOverlay[]
  samples: HeightmapSamples
}

/**
 * World Y at (x, z): first enabled layer whose extent contains the point, bilinear sample.
 * Overlapping extents: the earlier entry wins. None contain the point → null.
 */
export function getHeightAt(
  layers: readonly ReliefHeightLayer[],
  x: number,
  z: number,
): number | null {
  const layer = layers.find(one => one.enabled && containsXZ(one, x, z))
  if (!layer) return null

  const { samples } = layer
  const step = texelStep(layer.size, samples)
  const tx = (x - layer.origin.x) / step.x
  const tz = (z - layer.origin.z) / step.z
  const lastX = samples.width - 1
  const lastZ = samples.height - 1
  const x0 = clamp(Math.floor(tx), 0, lastX)
  const z0 = clamp(Math.floor(tz), 0, lastZ)
  const x1 = Math.min(x0 + 1, lastX)
  const z1 = Math.min(z0 + 1, lastZ)
  const read = reliefReader(samples, layer.grain, layer.edits, layer)
  const sample = mix(
    mix(read(x0, z0), read(x1, z0), tx - x0),
    mix(read(x0, z1), read(x1, z1), tx - x0),
    tz - z0,
  )
  return worldY(sample, layer.elevation)
}

export function withChunkDelta(
  samples: HeightmapSamples,
  sculpt: ReliefSculpt | undefined,
  at: ReliefChunkKey & { localX: number; localZ: number; delta: number },
  grain = RELIEF_CHUNK_TEXELS,
): ReliefSculpt {
  const layout = chunkLayout(at.column, at.row, samples.width, samples.height, grain)
  const held = sculpt?.chunks.find(chunk => chunk.column === at.column && chunk.row === at.row)
  const deltas = held
    ? unpackDeltas(held.payload, layout.width * layout.height)
    : new Float32Array(layout.width * layout.height)
  const index = at.localZ * layout.width + at.localX
  deltas[index] = (deltas[index] ?? 0) + at.delta
  return replaceChunk(sculpt, at, packDeltas(deltas))
}

export function chunkPayload(
  sculpt: ReliefSculpt | undefined,
  column: number,
  row: number,
): string {
  return sculpt?.chunks.find(chunk => chunk.column === column && chunk.row === row)?.payload ?? ''
}

export function changedChunks(
  before: ReliefSculpt | undefined,
  after: ReliefSculpt,
): PackedReliefChunk[] {
  // Indexed once rather than searched per key: a `.find` on both sides made this quadratic, which
  // a 1024² map turns into ~131 000 comparisons for every movement of the brush.
  const held = payloadsOf(before)
  const wanted = payloadsOf(after)
  const edits: PackedReliefChunk[] = []
  for (const [key, { column, row }] of new Map([...held, ...wanted])) {
    const payload = wanted.get(key)?.payload ?? ''
    if (payload === (held.get(key)?.payload ?? '')) continue
    edits.push({ column, row, payload })
  }
  return edits
}

export function withPackedChunks(
  sculpt: ReliefSculpt | undefined,
  edits: readonly PackedReliefChunk[],
): ReliefSculpt {
  let next = sculpt ?? { chunks: [] }
  for (const edit of edits) next = replaceChunk(next, edit, edit.payload)
  return next
}

export * from './reliefDisk'

/** Grain a payload names, or the fallback. Integer ≥ 1 — a 0 or a float is not a texel count. */
export function readReliefGrain(value: unknown, fallback = RELIEF_CHUNK_TEXELS): number {
  return readGrain(value, fallback)
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function replaceChunk(
  sculpt: ReliefSculpt | undefined,
  at: ReliefChunkKey,
  payload: string,
): ReliefSculpt {
  const others = (sculpt?.chunks ?? []).filter(
    chunk => chunk.column !== at.column || chunk.row !== at.row,
  )
  return {
    chunks: payload === '' ? others : [...others, { column: at.column, row: at.row, payload }],
  }
}
