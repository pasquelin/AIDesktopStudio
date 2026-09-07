import type { Mesh, Object3D } from 'three'
import {
  classificationsOf,
  collectOwnMeshes,
  lossyCandidatesOf,
  spatialCellsOf,
  warningOf,
} from './worldAnalyzerSupport'
export {
  analyzeLossyWorld,
  analyzeModelOptimization,
  estimatedLossyImpact,
  lossyCandidatesOf,
} from './worldAnalyzerSupport'
import { byCodeUnit } from '@shared/text'
import { stableKey } from '@shared/hash'
import { isDrawn } from './grouping'
import type { SceneNode, SceneState } from './sceneState'
import { bakeCandidatesOf } from './bakeCandidates'
import { runtimeArtifactsOf } from './runtimeWorldCompiler'
import {
  resolveOptimizationPolicy,
  type OptimizationPolicy,
} from '@shared/domain/optimizationPolicy'
import {
  collectMesh,
  collectNodeCandidates,
  createAnalysis,
  geometryByteLength,
  type Analysis,
} from './worldAnalyzerCollection'
import type { InstanceCandidate, OptimizationPlan, OptimizationReport } from './worldAnalyzerTypes'

export type {
  BatchCandidate,
  ClassifiedObject,
  GeometryDeduplication,
  InstanceCandidate,
  LossyCandidate,
  LossyOptimizationImpact,
  LossyWorldPlan,
  MaterialDeduplication,
  MergeCandidate,
  ModelOptimizationCandidate,
  OptimizationClassification,
  OptimizationImpact,
  OptimizationMetrics,
  OptimizationPlan,
  OptimizationReport,
  OptimizationWarning,
  OptimizationWarningReason,
  SpatialCellPlan,
  TextureOptimizationCandidate,
} from './worldAnalyzerTypes'
export { OPTIMIZATION_WARNING_REASONS } from './worldAnalyzerTypes'

export {
  DEFAULT_OPTIMIZATION_POLICY,
  type OptimizationPolicy,
} from '@shared/domain/optimizationPolicy'

/**
 * What the authoring world would draw. A runtime group parks its sources on another layer but
 * leaves them visible, so the report can still measure the editable baseline.
 */
function isRendered(mesh: Object3D, host: Object3D): boolean {
  return isDrawn(mesh, host)
}

export function analyzeOptimization(
  state: Pick<SceneState, 'nodes' | 'animation'>,
  host: Object3D,
  objectOf: (id: string) => Object3D | undefined,
  policy?: Partial<OptimizationPolicy>,
  runtimeNodes: readonly SceneNode[] = state.nodes,
): OptimizationPlan {
  return complete(
    optimizationSteps(state, host, objectOf, resolveOptimizationPolicy(policy), runtimeNodes, true),
  )
}

export async function analyzeOptimizationAsync(
  state: Pick<SceneState, 'nodes' | 'animation'>,
  host: Object3D,
  objectOf: (id: string) => Object3D | undefined,
  policy?: Partial<OptimizationPolicy>,
  runtimeNodes: readonly SceneNode[] = state.nodes,
  pause: () => Promise<void> = nextTask,
): Promise<OptimizationPlan> {
  const resolved = resolveOptimizationPolicy(policy)
  const steps = optimizationSteps(state, host, objectOf, resolved, runtimeNodes, false)
  let worked = 0
  while (true) {
    const step = steps.next()
    if (step.done) return step.value
    worked += 1
    if (worked >= resolved.analysisChunkSize) {
      worked = 0
      await pause()
    }
  }
}

function complete(steps: Generator<void, OptimizationPlan>): OptimizationPlan {
  while (true) {
    const step = steps.next()
    if (step.done) return step.value
  }
}

function* optimizationSteps(
  state: Pick<SceneState, 'nodes' | 'animation'>,
  host: Object3D,
  objectOf: (id: string) => Object3D | undefined,
  policy: OptimizationPolicy,
  runtimeNodes: readonly SceneNode[],
  includeBakeCandidates: boolean,
): Generator<void, OptimizationPlan> {
  const analysis = createAnalysis(state, runtimeNodes, policy)
  yield* collectAnalysis(state.nodes, host, objectOf, analysis)
  return optimizationPlan(state, runtimeNodes, objectOf, policy, includeBakeCandidates, analysis)
}

function* collectAnalysis(
  nodes: readonly SceneNode[],
  host: Object3D,
  objectOf: (id: string) => Object3D | undefined,
  analysis: Analysis,
): Generator<void> {
  for (const node of nodes) {
    const object = objectOf(node.id)
    const own: Mesh[] = []
    if (object) yield* collectOwnMeshes(node, object, own)
    const shown = object && isDrawn(object, host) ? own.filter(mesh => isRendered(mesh, host)) : []
    if (shown.length > 0) analysis.visibleObjects += 1
    for (const mesh of shown) {
      collectMesh(node.id, mesh, analysis)
      yield
    }
    yield* classifyNode(node, object, own, shown, analysis)
  }
}

/** Names what the node is, then opens the candidates its classification allows. */
function* classifyNode(
  node: SceneNode,
  object: Object3D | undefined,
  own: readonly Mesh[],
  shown: readonly Mesh[],
  analysis: Analysis,
): Generator<void> {
  const classifications = classificationsOf(node, object, analysis.animated.has(node.id), own)
  analysis.classifications.push({ id: node.id, classifications })
  const reason = warningOf(classifications)
  if (reason) analysis.warnings.push({ nodeId: node.id, reason })
  if (!classifications.includes('INSTANCABLE')) {
    yield
    return
  }
  for (const [meshIndex, mesh] of shown.entries()) {
    if (Array.isArray(mesh.material)) continue
    const unit = stableKey([node.id, meshIndex])
    if (!analysis.excluded.has(node.id)) collectNodeCandidates(node, mesh, unit, analysis)
    yield
  }
}

function instanceCandidates(analysis: Analysis, policy: OptimizationPolicy): InstanceCandidate[] {
  return [...analysis.candidateGroups]
    .map(([key, group]) => ({
      key,
      sourceIds: [...group.ids].sort(byCodeUnit),
      meshCount: group.units.size,
      units: group.units,
      forced: group.forced,
    }))
    .filter(group => group.forced || group.meshCount >= policy.minInstancesPerGroup)
    .map(group => ({ key: group.key, sourceIds: group.sourceIds, meshCount: group.meshCount }))
    .sort((one, other) => byCodeUnit(one.key, other.key))
}

function groupedCandidates(
  state: Pick<SceneState, 'nodes' | 'animation'>,
  runtimeNodes: readonly SceneNode[],
  policy: OptimizationPolicy,
  analysis: Analysis,
) {
  const runtimeArtifacts = runtimeArtifactsOf(runtimeNodes, state.animation, policy)
  const forcedIds = new Set(
    state.nodes.flatMap(node => (node.optimization?.mode === 'batch' ? [node.id] : [])),
  )
  const candidatesFor = (strategy: 'batch' | 'merge') =>
    runtimeArtifacts
      .filter(a => a.strategy === strategy)
      .map(a => ({ key: a.key, sourceIds: a.sourceIds, meshCount: a.sourceIds.length }))
      .sort((a, b) => byCodeUnit(a.key, b.key))
  const automatic = candidatesFor('batch').filter(group =>
    group.sourceIds.every(id => !forcedIds.has(id)),
  )
  const forced = [...analysis.batchGroups]
    .filter(([, group]) => group.forced)
    .map(([key, group]) => ({
      key,
      sourceIds: [...group.ids].sort(byCodeUnit),
      meshCount: group.units.size,
    }))
  return {
    batches: [...forced, ...automatic].sort((a, b) => byCodeUnit(a.key, b.key)),
    merges: candidatesFor('merge'),
  }
}

function sharedResources(analysis: Analysis) {
  const sharedGeometry = [
    ...[...analysis.geometryGroups.values()].flat(),
    ...analysis.largeGeometryGroups,
  ]
    .filter(group => group.uses > 1)
    .map(group => ({
      key: group.key,
      sourceIds: [...group.sourceIds].sort(byCodeUnit),
      bytes: geometryByteLength(group.canonical),
    }))
    .sort((a, b) => byCodeUnit(a.key, b.key))
  const sharedMaterials = [...analysis.materialGroups.values()]
    .flat()
    .filter(group => group.uses > 1)
    .map(group => ({ key: group.key, sourceIds: [...group.sourceIds].sort(byCodeUnit) }))
    .sort((a, b) => byCodeUnit(a.key, b.key))
  return { sharedGeometry, sharedMaterials }
}

function optimizationPlan(
  state: Pick<SceneState, 'nodes' | 'animation'>,
  runtimeNodes: readonly SceneNode[],
  objectOf: (id: string) => Object3D | undefined,
  policy: OptimizationPolicy,
  includeBakeCandidates: boolean,
  analysis: Analysis,
): OptimizationPlan {
  const instances = instanceCandidates(analysis, policy)
  const { batches, merges } = groupedCandidates(state, runtimeNodes, policy, analysis)
  const instanceSavings = instances.reduce((saved, group) => saved + group.meshCount - 1, 0)
  const groupedSavings = [...batches, ...merges].reduce(
    (saved, group) => saved + Math.max(0, group.meshCount - 1),
    0,
  )
  const shared = sharedResources(analysis)
  return {
    classifications: analysis.classifications,
    instances,
    bakeCandidates: includeBakeCandidates
      ? bakeCandidatesOf(state.nodes, runtimeNodes, analysis.animated)
      : [],
    batches,
    merges,
    ...shared,
    spatialCells: spatialCellsOf(state.nodes, objectOf, policy),
    ...lossyCandidatesOf(state.nodes),
    warnings: analysis.warnings,
    measured: {
      ...analysis.sceneStats,
      objects: state.nodes.length,
      visibleObjects: analysis.visibleObjects,
      meshes: analysis.drawn.size,
      geometryBytes: analysis.geometryBytes,
      sharedMaterials: analysis.sharedMaterialUses,
    },
    estimated: {
      drawCallsBefore: analysis.sceneStats.draws,
      drawCallsAfter: Math.max(0, analysis.sceneStats.draws - instanceSavings - groupedSavings),
      avoidedGeometryBytes: analysis.avoidedGeometryBytes,
      avoidedTextureBytes: analysis.avoidedTextureBytes,
    },
  }
}

function nextTask(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0))
}

export function optimizationReport(plan: OptimizationPlan): OptimizationReport {
  return {
    measured: plan.measured,
    estimated: plan.estimated,
    instanceCandidates: plan.instances.reduce((count, group) => count + group.meshCount, 0),
    batchCandidates: plan.batches.reduce((count, group) => count + group.meshCount, 0),
    visualChanges: 'NONE',
  }
}
