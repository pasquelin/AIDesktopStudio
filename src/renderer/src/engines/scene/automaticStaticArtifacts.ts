import { stableKey } from '@shared/hash'
import { byCodeUnit } from '@shared/text'
import type { OptimizationPolicy } from '@shared/domain/optimizationPolicy'
import type { RuntimeRenderArtifact } from './grouping'
import type { SceneNode } from './sceneState'
import { adaptiveCellsOf } from './adaptivePartition'

/** What every compatibility key ends with, whichever strategy asks for it. */
export function compatibilityTailOf(node: SceneNode): readonly unknown[] {
  return [node.castShadow, node.receiveShadow, node.optimization?.groupId ?? null]
}

export function pushArtifacts(
  into: RuntimeRenderArtifact[],
  strategyOf: (chunk: readonly SceneNode[]) => RuntimeRenderArtifact['strategy'],
  key: string,
  nodes: readonly SceneNode[],
  policy: OptimizationPolicy,
): void {
  const ordered = [...nodes].sort((one, other) => byCodeUnit(one.id, other.id))
  for (let offset = 0; offset < ordered.length; offset += policy.maxObjectsPerBatch) {
    const chunk = ordered.slice(offset, offset + policy.maxObjectsPerBatch)
    const strategy = strategyOf(chunk)
    const sourceIds = chunk.map(node => node.id)
    into.push({ key, strategy, sourceIds, signature: stableKey([strategy, key, sourceIds]) })
  }
}

export function automaticStaticArtifacts(
  nodes: readonly SceneNode[],
  spatialNodes: ReadonlyMap<string, SceneNode>,
  excluded: ReadonlySet<string>,
  selected: ReadonlySet<string>,
  policy: OptimizationPolicy,
): readonly RuntimeRenderArtifact[] {
  const parentIds = new Set(nodes.flatMap(node => (node.parentId ? [node.parentId] : [])))
  const compatible = compatibleStaticNodes(nodes, spatialNodes, excluded, selected, parentIds)
  const groups = spatialStaticGroups(compatible, policy)
  return staticArtifacts(groups, parentIds, policy)
}

function compatibleStaticNodes(
  nodes: readonly SceneNode[],
  spatialNodes: ReadonlyMap<string, SceneNode>,
  excluded: ReadonlySet<string>,
  selected: ReadonlySet<string>,
  parentIds: ReadonlySet<string>,
): Map<string, Extract<SceneNode, { type: 'mesh' }>[]> {
  const compatible = new Map<string, Extract<SceneNode, { type: 'mesh' }>[]>()
  for (const node of nodes) {
    if (!isAutomaticStatic(node, excluded, selected, parentIds)) continue
    const key = automaticCompatibilityKey(node)
    const members = compatible.get(key)
    const spatial = spatialNodes.get(node.id) ?? node
    if (spatial.type !== 'mesh') continue
    if (members) members.push(spatial)
    else compatible.set(key, [spatial])
  }
  return compatible
}

function isAutomaticStatic(
  node: SceneNode,
  excluded: ReadonlySet<string>,
  selected: ReadonlySet<string>,
  parentIds: ReadonlySet<string>,
): node is Extract<SceneNode, { type: 'mesh' }> {
  return (
    node.type === 'mesh' &&
    (node.optimization?.mode === undefined || node.optimization.mode === 'auto') &&
    !excluded.has(node.id) &&
    !selected.has(node.id) &&
    !parentIds.has(node.id) &&
    node.visible
  )
}

function automaticCompatibilityKey(node: Extract<SceneNode, { type: 'mesh' }>): string {
  return stableKey([
    node.material,
    node.negative ?? false,
    mergeLayoutOf(node),
    ...compatibilityTailOf(node),
  ])
}

function spatialStaticGroups(
  compatible: ReadonlyMap<string, Extract<SceneNode, { type: 'mesh' }>[]>,
  policy: OptimizationPolicy,
): Map<string, Extract<SceneNode, { type: 'mesh' }>[]> {
  const groups = new Map<string, Extract<SceneNode, { type: 'mesh' }>[]>()
  for (const [compatibilityKey, candidates] of compatible) {
    for (const { cell, nodes: members } of adaptiveCellsOf(candidates, policy)) {
      groups.set(stableKey([compatibilityKey, cell]), members)
    }
  }
  return groups
}

function staticArtifacts(
  groups: ReadonlyMap<string, Extract<SceneNode, { type: 'mesh' }>[]>,
  parentIds: ReadonlySet<string>,
  policy: OptimizationPolicy,
): RuntimeRenderArtifact[] {
  const artifacts: RuntimeRenderArtifact[] = []
  const mergeable = (chunk: readonly SceneNode[]): boolean =>
    chunk.length >= policy.minMergeSize &&
    chunk.length <= policy.maxObjectsPerMerge &&
    chunk.every(
      node => node.parentId === null && !parentIds.has(node.id) && !node.components?.length,
    )
  for (const [key, members] of groups) {
    if (members.length < policy.minBatchSize) continue
    pushArtifacts(artifacts, chunk => (mergeable(chunk) ? 'merge' : 'batch'), key, members, policy)
  }
  return artifacts
}

function mergeLayoutOf(node: SceneNode): string {
  if (node.type !== 'mesh') return ''
  switch (node.geometry.kind) {
    case 'dodecahedron':
    case 'icosahedron':
    case 'octahedron':
    case 'tetrahedron':
      return 'non-indexed'
    default:
      return 'indexed'
  }
}
