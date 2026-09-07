import type { GeometrySimplification, TextureCompression, TextureReduction } from './gameExport'

export type OptimizationPolicy = {
  minInstancesPerGroup: number
  minBatchSize: number
  minMergeSize: number
  maxObjectsPerMerge: number
  maxObjectsPerBatch: number
  maxBatchBounds: number
  spatialCellTargetSize: number
  spatialCellMinSize: number
  spatialCellTargetObjects: number
  analysisChunkSize: number
  maxSynchronousContentBytes: number
  simplificationRatios: Readonly<Record<GeometrySimplification, number>>
  lodDistanceMultipliers: readonly number[]
  lodSimplificationRatios: readonly number[]
  jpegQuality: Readonly<Record<Exclude<TextureCompression, 'off'>, number>>
  textureScale: Readonly<Record<TextureReduction, number>>
}

/** All strategy thresholds share one contract so benchmarks can move them without a code hunt. */
export const DEFAULT_OPTIMIZATION_POLICY: OptimizationPolicy = Object.freeze({
  minInstancesPerGroup: 16,
  minBatchSize: 2,
  minMergeSize: 2,
  maxObjectsPerMerge: 8,
  maxObjectsPerBatch: 2_048,
  maxBatchBounds: 256,
  spatialCellTargetSize: 256,
  spatialCellMinSize: 16,
  spatialCellTargetObjects: 256,
  analysisChunkSize: 100,
  maxSynchronousContentBytes: 1_500_000,
  simplificationRatios: Object.freeze({
    off: 0,
    conservative: 0.15,
    balanced: 0.35,
    aggressive: 0.6,
  }),
  lodDistanceMultipliers: Object.freeze([12, 36]),
  lodSimplificationRatios: Object.freeze([0.35, 0.65]),
  jpegQuality: Object.freeze({ conservative: 88, balanced: 75, aggressive: 55 }),
  textureScale: Object.freeze({ off: 1, half: 0.5, quarter: 0.25 }),
})

/** Fills a caller's partial thresholds so nothing downstream has to know which ones are optional. */
export function resolveOptimizationPolicy(
  partial: Partial<OptimizationPolicy> | undefined,
): OptimizationPolicy {
  return partial ? { ...DEFAULT_OPTIMIZATION_POLICY, ...partial } : DEFAULT_OPTIMIZATION_POLICY
}
