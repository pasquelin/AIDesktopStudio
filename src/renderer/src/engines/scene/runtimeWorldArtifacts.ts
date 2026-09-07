import { stableKey } from '@shared/hash'
import { byCodeUnit } from '@shared/text'
import { Euler, Matrix4, Quaternion, Vector3 } from 'three'
import {
  DEFAULT_OPTIMIZATION_POLICY,
  type OptimizationPolicy,
} from '@shared/domain/optimizationPolicy'
import type { AnimationTimeline } from '@shared/domain/animation'
import { movesOnItsOwn } from '@shared/domain/component'
import { cachedOn } from '../core/cachedOn'
import { behavioralGroupingExclusions, type RuntimeRenderArtifact } from './grouping'
import type { SceneNode, SceneState } from './sceneState'
import type { RuntimeOptimization, RuntimeWorld } from './runtimeWorldTypes'
import { adaptiveCellsOf, adaptiveRootCellKeyOf, nodeAtWorld } from './adaptivePartition'
import {
  automaticStaticArtifacts,
  compatibilityTailOf,
  pushArtifacts,
} from './automaticStaticArtifacts'

export type ArtifactWorldCompilation = {
  artifacts: readonly RuntimeRenderArtifact[]
  regions: Map<string, readonly RuntimeRenderArtifact[]>
  regionByNode: Map<string, string>
  regionMembers: Map<string, Set<string>>
  regional: boolean
  forcedMeshKeys: Set<string>
}

export function compileArtifactWorld(
  nodes: readonly SceneNode[],
  animation: AnimationTimeline,
): ArtifactWorldCompilation {
  if (nodes.some(node => node.parentId !== null)) {
    return {
      artifacts: runtimeArtifactsOf(nodes, animation),
      regions: new Map(),
      regionByNode: new Map(),
      regionMembers: new Map(),
      regional: false,
      forcedMeshKeys: new Set(),
    }
  }
  const regionByNode = new Map<string, string>()
  const regionMembers = new Map<string, Set<string>>()
  const driven = drivenNodeIdsOf(animation)
  const excluded = behavioralGroupingExclusions(nodes, driven)
  const forcedMeshKeys = forcedMeshKeysOf(nodes, excluded)
  for (const node of nodes) {
    const region = artifactRegionOf(node)
    if (!region) continue
    regionByNode.set(node.id, region)
    const members = regionMembers.get(region)
    if (members) members.add(node.id)
    else regionMembers.set(region, new Set([node.id]))
  }
  const byId = new Map(nodes.map(node => [node.id, node]))
  const regions = new Map<string, readonly RuntimeRenderArtifact[]>()
  for (const [region, ids] of regionMembers) {
    const members = [...ids].flatMap(id => {
      const node = byId.get(id)
      return node ? [node] : []
    })
    regions.set(
      region,
      runtimeArtifactsOf(membersWithForcedInstances(members, forcedMeshKeys, driven), animation),
    )
  }
  return {
    artifacts: [...regions.values()]
      .flat()
      .sort((one, other) => byCodeUnit(one.signature, other.signature)),
    regions,
    regionByNode,
    regionMembers,
    regional: true,
    forcedMeshKeys,
  }
}

export function drivenNodeIdsOf(animation: AnimationTimeline): ReadonlySet<string> {
  return new Set(animation.tracks.map(track => track.target.nodeId))
}

function forcedMeshKeysOf(
  nodes: readonly SceneNode[],
  excludedOrDriven: ReadonlySet<string>,
): Set<string> {
  return new Set(
    nodes.flatMap(node => {
      const key = forcedMeshKeyOf(node, excludedOrDriven)
      return key ? [key] : []
    }),
  )
}

/**
 * What `behavioralGroupingExclusions` says of ONE node, without the Map, Set and array it allocated
 * per node: a drag emits a patch per `pointermove`, and every changed node was paying that twice.
 */
export function forcedMeshKeyOf(
  node: SceneNode | undefined,
  excludedOrDriven: ReadonlySet<string>,
): string | null {
  if (node?.type !== 'mesh' || !node.visible || node.optimization?.mode !== 'instance') return null
  if (excludedOrDriven.has(node.id)) return null
  if (node.parentId !== null && excludedOrDriven.has(node.parentId)) return null
  if (movesOnItsOwn(node.components)) return null
  if (node.components?.some(component => component.type === 'Script')) return null
  return instanceCompatibilityKeyOf(node)
}

export function membersWithForcedInstances(
  nodes: readonly SceneNode[],
  forcedKeys: ReadonlySet<string>,
  driven: ReadonlySet<string>,
): readonly SceneNode[] {
  const excluded = behavioralGroupingExclusions(nodes, driven)
  const forcedInRegion = forcedMeshKeysOf(nodes, excluded)
  const promoted = new Set<string>()
  return nodes.map(node => {
    if (
      node.type !== 'mesh' ||
      excluded.has(node.id) ||
      (node.optimization?.mode ?? 'auto') !== 'auto'
    ) {
      return node
    }
    const key = instanceCompatibilityKeyOf(node)
    if (!forcedKeys.has(key) || forcedInRegion.has(key) || promoted.has(key)) return node
    promoted.add(key)
    return { ...node, optimization: { ...node.optimization, mode: 'instance' } }
  })
}

function artifactRegionOf(node: SceneNode): string | null {
  const mode = node.optimization?.mode ?? 'auto'
  if (!node.visible || mode === 'individual' || mode === 'exclude') return null
  if (node.type === 'mesh') {
    return `mesh:${adaptiveRootCellKeyOf(node, DEFAULT_OPTIMIZATION_POLICY) ?? `oversize:${node.id}`}`
  }
  if (node.type !== 'model') return null
  const strategy = mode === 'auto' || mode === 'instance' ? 'instance' : mode
  return `model:${strategy}:${mode === 'batch' ? batchCompatibilityKeyOf(node) : instanceCompatibilityKeyOf(node)}`
}

export function updateArtifactRegion(
  node: SceneNode,
  regionByNode: Map<string, string>,
  regionMembers: Map<string, Set<string>>,
  affected: Set<string>,
): void {
  removeArtifactRegion(node.id, regionByNode, regionMembers)
  const region = artifactRegionOf(node)
  if (!region) return
  regionByNode.set(node.id, region)
  const members = regionMembers.get(region)
  if (members) members.add(node.id)
  else regionMembers.set(region, new Set([node.id]))
  affected.add(region)
}

export function removeArtifactRegion(
  id: string,
  regionByNode: Map<string, string>,
  regionMembers: Map<string, Set<string>>,
): void {
  const region = regionByNode.get(id)
  if (!region) return
  regionByNode.delete(id)
  const members = regionMembers.get(region)
  members?.delete(id)
  if (members?.size === 0) regionMembers.delete(region)
}

export function runtimeState(
  source: SceneState,
  nodes: readonly SceneNode[],
  artifacts: readonly RuntimeRenderArtifact[],
): RuntimeWorld {
  return {
    nodes,
    selectedIds: [],
    world: source.world,
    animation: source.animation,
    runtimeOptimization: { artifacts },
  }
}

export function runtimeArtifactsOf(
  nodes: readonly SceneNode[],
  animation: AnimationTimeline,
  policy: OptimizationPolicy = DEFAULT_OPTIMIZATION_POLICY,
): readonly RuntimeRenderArtifact[] {
  const spatialNodes = spatialNodesOf(nodes)
  const excluded = behavioralGroupingExclusions(nodes, drivenNodeIdsOf(animation))
  const { groups, batches } = explicitGroups(nodes, spatialNodes, excluded)
  const instances = groupedArtifacts(groups, 'instance', policy)
  const batchArtifacts = groupedArtifacts(
    [...batches].map((entry): [string, CompatibilityGroup] => [
      entry[0],
      { nodes: entry[1], forced: true },
    ]),
    'batch',
    policy,
  )
  const selected = new Set(
    [...instances, ...batchArtifacts].flatMap(artifact => artifact.sourceIds),
  )
  const automatic = automaticStaticArtifacts(nodes, spatialNodes, excluded, selected, policy)
  return [...instances, ...batchArtifacts, ...automatic].sort((one, other) =>
    byCodeUnit(one.signature, other.signature),
  )
}

function explicitGroups(
  nodes: readonly SceneNode[],
  spatialNodes: ReadonlyMap<string, SceneNode>,
  excluded: ReadonlySet<string>,
): {
  groups: Map<string, { nodes: SceneNode[]; forced: boolean }>
  batches: Map<string, SceneNode[]>
} {
  const groups = new Map<string, { nodes: SceneNode[]; forced: boolean }>()
  const batches = new Map<string, SceneNode[]>()
  for (const node of nodes) addExplicitNode(node, spatialNodes, excluded, groups, batches)
  return { groups, batches }
}

function addExplicitNode(
  node: SceneNode,
  spatialNodes: ReadonlyMap<string, SceneNode>,
  excluded: ReadonlySet<string>,
  groups: Map<string, { nodes: SceneNode[]; forced: boolean }>,
  batches: Map<string, SceneNode[]>,
): void {
  if ((node.type !== 'mesh' && node.type !== 'model') || excluded.has(node.id) || !node.visible)
    return
  const mode = node.optimization?.mode ?? 'auto'
  const spatial = spatialNodes.get(node.id) ?? node
  if (mode === 'batch') {
    const key = batchCompatibilityKeyOf(node)
    const members = batches.get(key)
    if (members) members.push(spatial)
    else batches.set(key, [spatial])
    return
  }
  if (mode !== 'auto' && mode !== 'instance') return
  const key = instanceCompatibilityKeyOf(node)
  const group = groups.get(key)
  if (group) {
    group.nodes.push(spatial)
    group.forced ||= mode === 'instance'
  } else groups.set(key, { nodes: [spatial], forced: mode === 'instance' })
}

type CompatibilityGroup = { nodes: readonly SceneNode[]; forced: boolean }

const BATCH_KEYS = new WeakMap<SceneNode, string>()

function batchCompatibilityKeyOf(node: Extract<SceneNode, { type: 'mesh' | 'model' }>): string {
  return cachedOn(BATCH_KEYS, node, () =>
    stableKey([
      node.type,
      node.type === 'mesh' ? node.material : node.model.assetId,
      ...compatibilityTailOf(node),
    ]),
  )
}

const INSTANCE_KEYS = new WeakMap<SceneNode, string>()

function instanceCompatibilityKeyOf(node: Extract<SceneNode, { type: 'mesh' | 'model' }>): string {
  return cachedOn(INSTANCE_KEYS, node, () =>
    stableKey([
      node.type,
      node.type === 'mesh' ? [node.geometry, node.material, node.negative] : [node.model],
      ...compatibilityTailOf(node),
    ]),
  )
}

/**
 * Instances and forced batches partition the same way; only the strategy and the floor differ, and
 * a forced group has no floor.
 */
function groupedArtifacts(
  groups: Iterable<readonly [string, CompatibilityGroup]>,
  strategy: 'instance' | 'batch',
  policy: OptimizationPolicy,
): readonly RuntimeRenderArtifact[] {
  const artifacts: RuntimeRenderArtifact[] = []
  for (const [compatibilityKey, group] of groups) {
    if (!group.forced && group.nodes.length < policy.minInstancesPerGroup) continue
    const meshes = group.nodes.filter(
      (node): node is Extract<SceneNode, { type: 'mesh' }> => node.type === 'mesh',
    )
    if (meshes.length === group.nodes.length) {
      for (const { cell, nodes } of adaptiveCellsOf(meshes, policy)) {
        if (!group.forced && nodes.length < policy.minInstancesPerGroup) continue
        pushArtifacts(artifacts, () => strategy, stableKey([compatibilityKey, cell]), nodes, policy)
      }
      continue
    }
    pushArtifacts(artifacts, () => strategy, compatibilityKey, group.nodes, policy)
  }
  return artifacts
}

function spatialNodesOf(nodes: readonly SceneNode[]): ReadonlyMap<string, SceneNode> {
  const source = new Map(nodes.map(node => [node.id, node]))
  const matrices = new Map<string, Matrix4>()
  const visiting = new Set<string>()
  const matrixOf = (node: SceneNode): Matrix4 => {
    const known = matrices.get(node.id)
    if (known) return known
    const transform = node.transform
    const local = new Matrix4().compose(
      new Vector3(transform.position.x, transform.position.y, transform.position.z),
      new Quaternion().setFromEuler(
        new Euler(transform.rotation.x, transform.rotation.y, transform.rotation.z),
      ),
      new Vector3(transform.scale.x, transform.scale.y, transform.scale.z),
    )
    if (visiting.has(node.id)) return local
    visiting.add(node.id)
    const parent = node.parentId ? source.get(node.parentId) : undefined
    const world = parent ? matrixOf(parent).clone().multiply(local) : local
    visiting.delete(node.id)
    matrices.set(node.id, world)
    return world
  }
  return new Map(
    nodes.map(node => {
      const matrix = matrixOf(node)
      const scale = matrix.getMaxScaleOnAxis()
      return [
        node.id,
        nodeAtWorld(node, new Vector3().setFromMatrixPosition(matrix), {
          x: scale,
          y: scale,
          z: scale,
        }),
      ]
    }),
  )
}

const NODE_KEYS = new WeakMap<SceneNode, string>()

/** Nodes are immutable, so their serializations are worth keeping for as long as they live. */
export function nodeKeyOf(node: SceneNode): string {
  return cachedOn(NODE_KEYS, node, () => stableKey(node))
}

const ARTIFACT_INPUT_SIGNATURES = new WeakMap<SceneNode, string>()

export function artifactInputSignature(node: SceneNode): string {
  return cachedOn(ARTIFACT_INPUT_SIGNATURES, node, () =>
    stableKey([
      node.type,
      node.parentId,
      node.visible,
      node.castShadow,
      node.receiveShadow,
      node.components ?? null,
      node.optimization ?? null,
      node.transform,
      node.type === 'mesh' ? [node.geometry, node.material, node.negative] : null,
      node.type === 'model' ? node.model : null,
    ]),
  )
}

export function runtimeOptimizationOf(world: SceneState): RuntimeOptimization | null {
  if (!('runtimeOptimization' in world)) return null
  const optimization = world.runtimeOptimization
  return isRuntimeOptimization(optimization) ? optimization : null
}

function isRuntimeOptimization(value: unknown): value is RuntimeOptimization {
  if (!value || typeof value !== 'object' || !('artifacts' in value)) return false
  return Array.isArray(value.artifacts)
}
