import { clamp } from '../numeric'

/**
 * Which chunk, by grid address. Here rather than beside either half that wears it: the layout
 * and the packed payload both extend it, and a type re-imported from a parent is a cycle.
 */
export type ReliefChunkKey = { column: number; row: number }

export type ReliefChunkLayout = ReliefChunkKey & {
  sampleX: number
  sampleZ: number
  width: number
  height: number
}

export type ReliefOrigin = { x: number; z: number }
export type ReliefSize = { x: number; z: number }

/**
 * Where a relief sits and what its samples are worth. Down here with the arithmetic that reads
 * it — `relief.ts` republishes it, and declaring it up there is what closed the loop.
 */
export type ReliefExtent = {
  origin: ReliefOrigin
  size: ReliefSize
  elevation: { min: number; max: number }
}

export const RELIEF_CHUNK_TEXELS = 64
export const RELIEF_CHUNK_CANDIDATES: readonly number[] = [64, 128]

export function chunkVerticesPerSide(grain: number): number {
  return grain + 1
}

export function chunkCountAlong(samples: number, grain: number): number {
  return Math.max(1, Math.ceil((Math.max(1, samples) - 1) / grain))
}

export type ChunkMemory = {
  position: number
  normal: number
  uv: number
  index: number
  /** Vertex tint of a painted mask. Allocated only on a terrain someone painted. */
  color: number
  total: number
}

export function chunkMemoryBytes(grain: number): ChunkMemory {
  const vertices = chunkVerticesPerSide(grain) ** 2
  const position = vertices * 12
  const normal = vertices * 12
  const uv = vertices * 8
  const index = grain * grain * 6 * 2
  // The painted-mask tint counted with the rest: left out, the budget of a painted terrain was
  // short by 50 700 bytes a chunk at grain 64 — 27,5 % of what it claimed.
  const color = vertices * 12
  return { position, normal, uv, index, color, total: position + normal + uv + index + color }
}

export type RegionUpload = { position: number; normal: number; total: number }

export function regionUploadBytes(texelsX: number, texelsZ: number): RegionUpload {
  const position = (texelsX + 1) * (texelsZ + 1) * 12
  const normal = (texelsX + 3) * (texelsZ + 3) * 12
  return { position, normal, total: position + normal }
}

export function texelStep(
  size: ReliefSize,
  samples: { width: number; height: number },
): ReliefSize {
  return {
    x: size.x / Math.max(1, samples.width - 1),
    z: size.z / Math.max(1, samples.height - 1),
  }
}

export function worldY(sample: number, elevation: { min: number; max: number }): number {
  return elevation.min + sample * (elevation.max - elevation.min)
}

export function sampleOfWorldY(y: number, elevation: { min: number; max: number }): number {
  const span = elevation.max - elevation.min
  return span === 0 ? 0 : (y - elevation.min) / span
}

export function chunkLayout(
  column: number,
  row: number,
  width: number,
  height: number,
  grain: number,
): ReliefChunkLayout {
  const sampleX = column * grain
  const sampleZ = row * grain
  return {
    column,
    row,
    sampleX,
    sampleZ,
    width: clamp(width - 1 - sampleX, 0, grain) + 1,
    height: clamp(height - 1 - sampleZ, 0, grain) + 1,
  }
}
