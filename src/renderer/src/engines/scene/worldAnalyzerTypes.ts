import type { BufferGeometry } from 'three'
import type { BakeCandidate } from './bakeCandidates'
import type { SceneStats } from './sceneStats'

export type OptimizationClassification =
  | 'STATIC'
  | 'DYNAMIC'
  | 'SKINNED'
  | 'ANIMATED'
  | 'PARTICLE'
  | 'INSTANCABLE'
  | 'BATCHABLE'
  | 'MERGEABLE'
  | 'UNSAFE'

export type ClassifiedObject = {
  id: string
  classifications: readonly OptimizationClassification[]
}

export type InstanceCandidate = {
  key: string
  sourceIds: readonly string[]
  meshCount: number
}

export type BatchCandidate = InstanceCandidate
export type MergeCandidate = InstanceCandidate

export type GeometryDeduplication = {
  key: string
  sourceIds: readonly string[]
  bytes: number
}

export type MaterialDeduplication = {
  key: string
  sourceIds: readonly string[]
}

export type SpatialCellPlan = {
  key: string
  sourceIds: readonly string[]
}

export type OptimizationWarningReason = 'animated' | 'dynamic' | 'skinned'

/** Read by the dialog that names them and by the guard that checks each one is translated. */
export const OPTIMIZATION_WARNING_REASONS: readonly OptimizationWarningReason[] = [
  'animated',
  'dynamic',
  'skinned',
]

export type OptimizationWarning = {
  nodeId: string
  reason: OptimizationWarningReason
}

export type OptimizationMetrics = SceneStats & {
  objects: number
  visibleObjects: number
  meshes: number
  geometryBytes: number
  sharedMaterials: number
}

export type OptimizationImpact = {
  drawCallsBefore: number
  drawCallsAfter: number
  avoidedGeometryBytes: number
  avoidedTextureBytes: number
}

export type LossyCandidate = { nodeId: string }
export type TextureOptimizationCandidate = { assetId: string }
export type LossyWorldPlan = { nodeIds: readonly string[] }
export type ModelOptimizationCandidate = { meshIndex: number; geometry: BufferGeometry }

export type OptimizationPlan = {
  classifications: readonly ClassifiedObject[]
  instances: readonly InstanceCandidate[]
  bakeCandidates: readonly BakeCandidate[]
  batches: readonly BatchCandidate[]
  merges: readonly MergeCandidate[]
  sharedGeometry: readonly GeometryDeduplication[]
  sharedMaterials: readonly MaterialDeduplication[]
  spatialCells: readonly SpatialCellPlan[]
  lodCandidates?: readonly LossyCandidate[]
  textureCandidates?: readonly TextureOptimizationCandidate[]
  warnings: readonly OptimizationWarning[]
  measured: OptimizationMetrics
  estimated: OptimizationImpact
}

export type OptimizationReport = {
  measured: OptimizationMetrics
  estimated: OptimizationImpact
  instanceCandidates: number
  batchCandidates: number
  visualChanges: 'NONE'
}

export type LossyOptimizationImpact = {
  trianglesAfter: number
  geometryBytesAfter: number
  textureBytesAfter: number
}
