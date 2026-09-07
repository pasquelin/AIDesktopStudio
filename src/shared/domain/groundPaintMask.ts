import type { GroundPaint } from './groundPaint'
import { chunkLayout, packDeltas, type ReliefSculpt } from './relief'
import { groundMaterialChannelOffset, type GroundMaterialChannel } from './sceneModel'
import { SCATTER_MASK_TEXELS } from './scatter'

export type PaintExtent = { origin: { x: number; z: number }; size: { x: number; z: number } }

export function scatterMaskFromGroundPaint(
  paint: GroundPaint,
  source: PaintExtent,
  target: PaintExtent,
  grain: number,
  channel: GroundMaterialChannel = 'g',
): ReliefSculpt {
  const weights = new Float32Array(SCATTER_MASK_TEXELS * SCATTER_MASK_TEXELS)
  for (let z = 0; z < SCATTER_MASK_TEXELS; z += 1) {
    for (let x = 0; x < SCATTER_MASK_TEXELS; x += 1) {
      const worldX = target.origin.x + (x / (SCATTER_MASK_TEXELS - 1)) * target.size.x
      const worldZ = target.origin.z + (z / (SCATTER_MASK_TEXELS - 1)) * target.size.z
      weights[z * SCATTER_MASK_TEXELS + x] = paintedWeightAt(paint, source, worldX, worldZ, channel)
    }
  }
  return packedWeights(weights, grain)
}

function paintedWeightAt(
  paint: GroundPaint,
  extent: PaintExtent,
  worldX: number,
  worldZ: number,
  channel: GroundMaterialChannel,
): number {
  const u = (worldX - extent.origin.x) / extent.size.x
  const v = (worldZ - extent.origin.z) / extent.size.z
  if (u < 0 || u > 1 || v < 0 || v > 1) return 0
  const x = Math.round(u * (paint.width - 1))
  const z = Math.round(v * (paint.height - 1))
  const offset = (z * paint.width + x) * 4
  return (paint.pixels[offset + groundMaterialChannelOffset(channel)] ?? 0) / 255
}

/**
 * Packed by `chunkLayout`, which is what every reader decodes with — chunks SHARE their edge, so
 * an inner one is `grain + 1` wide. Packing them `grain` wide sheared every row of the mask.
 */
function packedWeights(weights: Float32Array, grain: number): ReliefSculpt {
  const chunks: ReliefSculpt['chunks'][number][] = []
  const along = Math.ceil(SCATTER_MASK_TEXELS / grain)
  for (let row = 0; row < along; row += 1) {
    for (let column = 0; column < along; column += 1) {
      const layout = chunkLayout(column, row, SCATTER_MASK_TEXELS, SCATTER_MASK_TEXELS, grain)
      const chunk = new Float32Array(layout.width * layout.height)
      for (let z = 0; z < layout.height; z += 1) {
        const start = (layout.sampleZ + z) * SCATTER_MASK_TEXELS + layout.sampleX
        chunk.set(weights.subarray(start, start + layout.width), z * layout.width)
      }
      chunks.push({ column, row, payload: packDeltas(chunk) })
    }
  }
  return { chunks }
}
