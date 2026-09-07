import {
  changedChunks,
  chunkLayout,
  texelStep,
  type ReliefChunkKey,
  type ReliefExtent,
  type ReliefMask,
} from './relief'
import { SCATTER_MASK_TEXELS, type ScatterFollowRelief, type ScatterLayer } from './scatter'
import {
  scatterPosesOf,
  type ScatterGround,
  type ScatterPose,
  type ScatterRegion,
} from './scatterGenerate'

export type ScatterRebuild =
  { kind: 'none' } | { kind: 'all' } | { kind: 'brush'; region: ScatterRegion }

/** What a layer edit changes in the already drawn scatter cells. */
export function scatterLayerRebuildOf(before: ScatterLayer, after: ScatterLayer): ScatterRebuild {
  if (before === after) return { kind: 'none' }
  if (
    before.enabled !== after.enabled ||
    before.category !== after.category ||
    before.seed !== after.seed ||
    before.origin.x !== after.origin.x ||
    before.origin.z !== after.origin.z ||
    before.size.x !== after.size.x ||
    before.size.z !== after.size.z ||
    before.grain !== after.grain ||
    before.followRelief !== after.followRelief ||
    !sameRules(before, after) ||
    !sameAssets(before, after)
  ) {
    return { kind: 'all' }
  }
  if (before.mask === after.mask || sameProceduralMask(before.mask, after.mask)) {
    return { kind: 'none' }
  }
  if (before.mask?.kind !== 'painted' || after.mask?.kind !== 'painted') return { kind: 'all' }
  const dirtied = changedChunks(before.mask.weights, after.mask.weights)
  return dirtied.length === 0
    ? { kind: 'none' }
    : {
        kind: 'brush',
        region: paintedRegionOf(dirtied, after),
      }
}

function sameRules(before: ScatterLayer, after: ScatterLayer): boolean {
  const left = before.rules as Record<string, unknown>
  const right = after.rules as Record<string, unknown>
  const keys = new Set([...Object.keys(left), ...Object.keys(right)])
  return [...keys].every(key => left[key] === right[key])
}

function sameAssets(before: ScatterLayer, after: ScatterLayer): boolean {
  return (
    before.assets.length === after.assets.length &&
    before.assets.every(
      (asset, index) =>
        asset.assetId === after.assets[index]?.assetId &&
        asset.weight === after.assets[index]?.weight,
    )
  )
}

function sameProceduralMask(
  before: ReliefMask | undefined,
  after: ReliefMask | undefined,
): boolean {
  if (!before || !after || before.kind !== after.kind) return false
  return (
    before.kind !== 'painted' &&
    after.kind !== 'painted' &&
    before.min === after.min &&
    before.max === after.max
  )
}

function paintedRegionOf(dirtied: readonly ReliefChunkKey[], layer: ScatterLayer): ScatterRegion {
  const samples = { width: SCATTER_MASK_TEXELS, height: SCATTER_MASK_TEXELS }
  const region = regionOf(dirtied, { ...layer, elevation: { min: 0, max: 1 }, samples })
  const step = texelStep(layer.size, samples)
  const extent = layerRegion(layer)
  return {
    minX: Math.max(extent.minX, region.minX - step.x / 2),
    minZ: Math.max(extent.minZ, region.minZ - step.z / 2),
    maxX: Math.min(extent.maxX, region.maxX + step.x / 2),
    maxZ: Math.min(extent.maxZ, region.maxZ + step.z / 2),
  }
}

/**
 * What a scatter layer must rebuild after a relief sculpt. Subscribes to `dirtiedChunks` —
 * no second notification bus.
 */
export function scatterRebuildOf(
  follow: ScatterFollowRelief,
  dirtied: readonly ReliefChunkKey[],
  terrain: ReliefExtent & { grain: number; samples: { width: number; height: number } },
): ScatterRebuild {
  if (follow === 'none' || dirtied.length === 0) return { kind: 'none' }
  if (follow === 'layer') return { kind: 'all' }
  return { kind: 'brush', region: regionOf(dirtied, terrain) }
}

export function scatterPosesAfterSculpt(
  layer: ScatterLayer,
  previous: readonly ScatterPose[],
  rebuild: ScatterRebuild,
  ground: ScatterGround,
): readonly ScatterPose[] {
  if (rebuild.kind === 'none') return previous
  if (rebuild.kind === 'all') {
    return scatterPosesOf(layer, layerRegion(layer), ground)
  }
  const kept = previous.filter(
    pose =>
      pose.x < rebuild.region.minX ||
      pose.x >= rebuild.region.maxX ||
      pose.z < rebuild.region.minZ ||
      pose.z >= rebuild.region.maxZ,
  )
  return [...kept, ...scatterPosesOf(layer, rebuild.region, ground)]
}

export function layerRegion(layer: ScatterLayer): ScatterRegion {
  return {
    minX: layer.origin.x,
    minZ: layer.origin.z,
    maxX: layer.origin.x + layer.size.x,
    maxZ: layer.origin.z + layer.size.z,
  }
}

function regionOf(
  dirtied: readonly ReliefChunkKey[],
  terrain: ReliefExtent & { grain: number; samples: { width: number; height: number } },
): ScatterRegion {
  const step = texelStep(terrain.size, terrain.samples)
  let minX = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxZ = -Infinity
  for (const chunk of dirtied) {
    const layout = chunkLayout(
      chunk.column,
      chunk.row,
      terrain.samples.width,
      terrain.samples.height,
      terrain.grain,
    )
    const x0 = terrain.origin.x + layout.sampleX * step.x
    const z0 = terrain.origin.z + layout.sampleZ * step.z
    minX = Math.min(minX, x0)
    minZ = Math.min(minZ, z0)
    maxX = Math.max(maxX, x0 + (layout.width - 1) * step.x)
    maxZ = Math.max(maxZ, z0 + (layout.height - 1) * step.z)
  }
  return { minX, minZ, maxX, maxZ }
}
