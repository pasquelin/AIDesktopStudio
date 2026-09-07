import { clamp } from '../numeric'
import { chunkLayout, unpackDeltas, type PackedReliefChunk } from './relief'
import { standingAngles } from './scatterRotation'
import {
  SCATTER_MASK_TEXELS,
  SCATTER_SPACING,
  type ScatterAsset,
  type ScatterLayer,
  type ScatterRules,
} from './scatter'

export type ScatterRegion = { minX: number; minZ: number; maxX: number; maxZ: number }

export type ScatterGround = {
  heightAt: (x: number, z: number) => number | null
  slopeAt: (x: number, z: number) => { degrees: number; nx: number; ny: number; nz: number }
}

export type ScatterPose = {
  assetId: string
  x: number
  y: number
  z: number
  scale: number
  rotation: { x: number; y: number; z: number }
}

const DEG = Math.PI / 180
const LANES = { jitterX: 1, jitterZ: 2, accept: 3, mask: 4, asset: 5, scale: 6, yaw: 7, tilt: 8 }

type MaskCache = Map<PackedReliefChunk, Float32Array>

/**
 * One Mulberry32 draw from a cell address. Sequential `createRandom` would shift every later
 * point when a neighbour is rebuilt; hashing the cell keeps each pose independent.
 */
export function scatterHash(seed: number, gx: number, gz: number, lane: number): number {
  let state =
    (seed ^ Math.imul(gx, 0x9e3779b1) ^ Math.imul(gz, 0x85ebca6b) ^ Math.imul(lane, 0xc2b2ae35)) >>>
    0
  state = (state + 0x6d2b79f5) >>> 0
  let drawn = Math.imul(state ^ (state >>> 15), 1 | state)
  drawn = (drawn + Math.imul(drawn ^ (drawn >>> 7), 61 | drawn)) ^ drawn
  return ((drawn ^ (drawn >>> 14)) >>> 0) / 4294967296
}

export function scatterPosesOf(
  layer: ScatterLayer,
  region: ScatterRegion,
  ground: ScatterGround,
): readonly ScatterPose[] {
  if (!layer.enabled || layer.assets.length === 0) return []
  const rules = layer.rules
  // Never below the floor: at 1e-3 a 256 m cell walked 65 billion cells and hung the renderer
  // thread. The slider no longer reaches under it; a document written when it did still can.
  const step = Math.max(rules.spacing, SCATTER_SPACING.step)
  const chance = clamp(rules.density * step * step, 0, 1)
  if (chance === 0) return []

  const poses: ScatterPose[] = []
  const maskCache: MaskCache = new Map()
  const gx0 = Math.floor(region.minX / step)
  const gx1 = Math.ceil(region.maxX / step)
  const gz0 = Math.floor(region.minZ / step)
  const gz1 = Math.ceil(region.maxZ / step)
  for (let gz = gz0; gz < gz1; gz++) {
    for (let gx = gx0; gx < gx1; gx++) {
      const pose = poseAt(layer, rules, ground, region, gx, gz, step, chance, maskCache)
      if (pose) poses.push(pose)
    }
  }
  return poses
}

function poseAt(
  layer: ScatterLayer,
  rules: ScatterRules,
  ground: ScatterGround,
  region: ScatterRegion,
  gx: number,
  gz: number,
  step: number,
  chance: number,
  maskCache: MaskCache,
): ScatterPose | null {
  const x = (gx + 0.25 + scatterHash(layer.seed, gx, gz, LANES.jitterX) * 0.5) * step
  const z = (gz + 0.25 + scatterHash(layer.seed, gx, gz, LANES.jitterZ) * 0.5) * step
  if (!acceptedAt(layer, rules, ground, region, gx, gz, x, z, chance, maskCache)) return null
  const slope = ground.slopeAt(x, z)
  const assetId = pickAsset(layer.assets, scatterHash(layer.seed, gx, gz, LANES.asset))
  if (!assetId) return null
  return {
    assetId,
    x,
    y: ground.heightAt(x, z) ?? 0,
    z,
    scale:
      rules.minScale +
      (rules.maxScale - rules.minScale) * scatterHash(layer.seed, gx, gz, LANES.scale),
    rotation: rotationOf(
      slope,
      rules.slopeAlign,
      rules.randomRotation ? scatterHash(layer.seed, gx, gz, LANES.yaw) * Math.PI * 2 : 0,
      (scatterHash(layer.seed, gx, gz, LANES.tilt) * 2 - 1) * rules.randomTilt * DEG,
    ),
  }
}

function acceptedAt(
  layer: ScatterLayer,
  rules: ScatterRules,
  ground: ScatterGround,
  region: ScatterRegion,
  gx: number,
  gz: number,
  x: number,
  z: number,
  chance: number,
  maskCache: MaskCache,
): boolean {
  if (!inside(region, x, z) || !insideLayer(layer, x, z)) return false
  if (scatterHash(layer.seed, gx, gz, LANES.accept) >= chance) return false
  const weight = maskWeightAt(layer, x, z, ground, maskCache)
  if (weight <= 0) return false
  if (weight < 1 && scatterHash(layer.seed, gx, gz, LANES.mask) >= weight) return false
  const y = ground.heightAt(x, z) ?? 0
  if (y < rules.altitudeMin || y > rules.altitudeMax) return false
  const slope = ground.slopeAt(x, z).degrees
  return slope >= rules.slopeMin && slope <= rules.slopeMax
}

function rotationOf(
  slope: { nx: number; ny: number; nz: number },
  slopeAlign: number,
  yaw: number,
  tilt: number,
): { x: number; y: number; z: number } {
  const align = clamp(slopeAlign, 0, 100) / 100
  const up = {
    x: slope.nx * align,
    y: 1 - align + slope.ny * align,
    z: slope.nz * align,
  }
  const angles = standingAngles(up, yaw)
  // The extra tilt rides on the pitch, as it did: it is a wobble, not a second alignment.
  return { ...angles, x: angles.x + tilt }
}

function pickAsset(assets: readonly ScatterAsset[], unit: number): string | null {
  const total = assets.reduce((sum, asset) => sum + Math.max(0, asset.weight), 0)
  if (total <= 0) return null
  let cursor = unit * total
  for (const asset of assets) {
    cursor -= Math.max(0, asset.weight)
    if (cursor <= 0) return asset.assetId
  }
  return assets[assets.length - 1]?.assetId ?? null
}

function maskWeightAt(
  layer: ScatterLayer,
  x: number,
  z: number,
  ground: ScatterGround,
  maskCache: MaskCache,
): number {
  const mask = layer.mask
  if (!mask) return 1
  if (mask.kind === 'height') {
    const height = ground.heightAt(x, z)
    return height !== null && inRange(height, mask.min, mask.max) ? 1 : 0
  }
  if (mask.kind === 'slope') {
    return inRange(ground.slopeAt(x, z).degrees, mask.min, mask.max) ? 1 : 0
  }
  return paintedWeightAt(layer, x, z, maskCache)
}

function paintedWeightAt(layer: ScatterLayer, x: number, z: number, maskCache: MaskCache): number {
  const mask = layer.mask
  if (!mask || mask.kind !== 'painted') return 1
  const width = SCATTER_MASK_TEXELS
  const sx = Math.round(((x - layer.origin.x) / Math.max(layer.size.x, 1e-6)) * (width - 1))
  const sz = Math.round(((z - layer.origin.z) / Math.max(layer.size.z, 1e-6)) * (width - 1))
  if (sx < 0 || sz < 0 || sx >= width || sz >= width) return 0
  const grain = Math.max(1, layer.grain)
  const column = Math.min(Math.floor(sx / grain), Math.ceil(width / grain) - 1)
  const row = Math.min(Math.floor(sz / grain), Math.ceil(width / grain) - 1)
  const packed = mask.weights.chunks.find(chunk => chunk.column === column && chunk.row === row)
  if (!packed) return 0
  const layout = chunkLayout(column, row, width, width, grain)
  let deltas = maskCache.get(packed)
  if (!deltas) {
    deltas = unpackDeltas(packed.payload, layout.width * layout.height)
    maskCache.set(packed, deltas)
  }
  return clamp(deltas[(sz - layout.sampleZ) * layout.width + (sx - layout.sampleX)] ?? 0, 0, 1)
}

function inside(region: ScatterRegion, x: number, z: number): boolean {
  return x >= region.minX && x < region.maxX && z >= region.minZ && z < region.maxZ
}

function insideLayer(layer: ScatterLayer, x: number, z: number): boolean {
  return (
    x >= layer.origin.x &&
    x <= layer.origin.x + layer.size.x &&
    z >= layer.origin.z &&
    z <= layer.origin.z + layer.size.z
  )
}

function inRange(value: number, min: number, max: number): boolean {
  return value >= Math.min(min, max) && value <= Math.max(min, max)
}
