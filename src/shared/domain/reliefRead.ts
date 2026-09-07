import { clamp } from '../numeric'
import type { HeightmapSamples } from './heightmap'
import { unpackDeltas } from './reliefPacking'
import type { ReliefSculpt } from './reliefPacking'
import { chunkCountAlong, chunkLayout, texelStep, worldY } from './reliefMetrics'
import type { ReliefChunkKey, ReliefChunkLayout, ReliefExtent } from './reliefMetrics'
import type { ReliefMask, ReliefOverlay } from './reliefOverlay'

export type ReliefRead = (sx: number, sz: number) => number

/**
 * Base plus the enabled overlays at one sample. 🛑 A loop over samples wants `reliefReader`
 * instead: this decodes the whole chunk it lands in, every call.
 */
export function combinedAt(
  samples: HeightmapSamples,
  grain: number,
  overlays: readonly ReliefOverlay[],
  sx: number,
  sz: number,
  extent?: ReliefExtent,
): number {
  return reliefReader(samples, grain, overlays, extent)(sx, sz)
}

/**
 * Reads base + Σ(enabled ? alpha * mask * delta) over many samples, each overlay's chunk
 * decoded once and held. A sculpt stroke rebuilds 4 225 vertices from one chunk, five reads
 * apiece — `reliefReadCost.test.ts`.
 */
export function reliefReader(
  samples: HeightmapSamples,
  grain: number,
  overlays: readonly ReliefOverlay[],
  extent?: ReliefExtent,
): ReliefRead {
  const active = overlays.filter(edit => edit.enabled && edit.alpha !== 0 && edit.sculpt)
  if (active.length === 0) return (sx, sz) => samples.values[sz * samples.width + sx] ?? 0

  const readers = active.map(edit => ({
    alpha: edit.alpha,
    deltaAt: overlayDeltaReader(samples, grain, edit.sculpt),
    mask: edit.mask,
    paintedAt:
      edit.mask?.kind === 'painted'
        ? overlayDeltaReader(samples, grain, edit.mask.weights)
        : undefined,
  }))
  const unmaskedAt = (sx: number, sz: number, except: object): number => {
    const base = samples.values[sz * samples.width + sx] ?? 0
    let added = 0
    for (const one of readers) {
      if (one === except) continue
      added += one.alpha * one.deltaAt(sx, sz)
    }
    return base + added
  }
  return (sx, sz) => {
    const base = samples.values[sz * samples.width + sx] ?? 0
    let added = 0
    for (const one of readers) {
      added +=
        one.alpha * maskWeight(one, sx, sz, unmaskedAt, samples, extent) * one.deltaAt(sx, sz)
    }
    return base + added
  }
}

function maskWeight(
  overlay: {
    mask?: ReliefMask
    paintedAt?: (sx: number, sz: number) => number
  },
  sx: number,
  sz: number,
  unmaskedAt: (sx: number, sz: number, except: object) => number,
  samples: HeightmapSamples,
  extent?: ReliefExtent,
): number {
  const mask = overlay.mask
  if (!mask) return 1
  if (mask.kind === 'painted') return clamp(overlay.paintedAt?.(sx, sz) ?? 0, 0, 1)
  if (!extent) return 1
  if (mask.kind === 'height') {
    return inRange(worldY(unmaskedAt(sx, sz, overlay), extent.elevation), mask.min, mask.max)
      ? 1
      : 0
  }
  return inRange(slopeDegrees(unmaskedAt, overlay, samples, extent, sx, sz), mask.min, mask.max)
    ? 1
    : 0
}

function slopeDegrees(
  unmaskedAt: (sx: number, sz: number, except: object) => number,
  overlay: { mask?: ReliefMask },
  samples: HeightmapSamples,
  extent: ReliefExtent,
  sx: number,
  sz: number,
): number {
  const step = texelStep(extent.size, samples)
  const lastX = samples.width - 1
  const lastZ = samples.height - 1
  const height = (x: number, z: number): number =>
    worldY(unmaskedAt(clamp(x, 0, lastX), clamp(z, 0, lastZ), overlay), extent.elevation)
  const nx = (height(sx - 1, sz) - height(sx + 1, sz)) / (2 * step.x)
  const nz = (height(sx, sz - 1) - height(sx, sz + 1)) / (2 * step.z)
  const length = Math.hypot(nx, 1, nz) || 1
  return Math.acos(clamp(1 / length, -1, 1)) * (180 / Math.PI)
}

/**
 * Hard 1/0 for height/slope masks — no fade at min/max. Intentional this lot, not a missing
 * blend: a large edit can crease along the bound (bathtub ring). A configurable edge falloff
 * is a later lot.
 */
function inRange(value: number, min: number, max: number): boolean {
  return value >= Math.min(min, max) && value <= Math.max(min, max)
}

/** Packed sculpt or painted-mask deltas at a sample; each chunk is decoded once per reader. */
export function overlayDeltaReader(
  samples: HeightmapSamples,
  grain: number,
  sculpt: ReliefSculpt | undefined,
): (sx: number, sz: number) => number {
  if (!sculpt) return () => 0
  const live = new Map<string, LiveChunk | null>()
  return (sx, sz) => {
    const column = chunkIndexAt(sx, samples.width, grain)
    const row = chunkIndexAt(sz, samples.height, grain)
    const key = `${column}:${row}`
    let held = live.get(key)
    if (held === undefined) {
      held = decodedChunk(samples, sculpt, grain, { column, row })
      live.set(key, held)
    }
    if (!held) return 0
    return held.deltas[(sz - held.sampleZ) * held.width + (sx - held.sampleX)] ?? 0
  }
}

type LiveChunk = ReliefChunkLayout & { deltas: Float32Array }

function chunkIndexAt(sample: number, samples: number, grain: number): number {
  return Math.min(Math.floor(sample / grain), chunkCountAlong(samples, grain) - 1)
}

function decodedChunk(
  samples: HeightmapSamples,
  sculpt: ReliefSculpt,
  grain: number,
  key: ReliefChunkKey,
): LiveChunk | null {
  const packed = sculpt.chunks.find(one => one.column === key.column && one.row === key.row)
  if (!packed) return null
  const layout = chunkLayout(key.column, key.row, samples.width, samples.height, grain)
  return { ...layout, deltas: unpackDeltas(packed.payload, layout.width * layout.height) }
}
