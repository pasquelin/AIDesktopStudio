import { LOD, Mesh, PropertyBinding, SkinnedMesh, Vector3 } from 'three'
import type { Object3D } from 'three'
import { byCodeUnit } from '@shared/text'
import { movesOnItsOwn } from '@shared/domain/component'
import type { LossyOptimization } from '@shared/domain/gameExport'
import {
  DEFAULT_OPTIMIZATION_POLICY,
  type OptimizationPolicy,
} from '@shared/domain/optimizationPolicy'
import { adaptiveCellsOf, cellKeyOf, maximumCellSize, nodeAtWorld } from './adaptivePartition'
import { isInstanceable } from './instanceableModel'
import type { SceneNode } from './sceneState'
import type {
  LossyOptimizationImpact,
  LossyWorldPlan,
  ModelOptimizationCandidate,
  OptimizationClassification,
  OptimizationPlan,
  OptimizationWarning,
  SpatialCellPlan,
} from './worldAnalyzerTypes'

export function spatialCellsOf(
  nodes: readonly SceneNode[],
  objectOf: (id: string) => Object3D | undefined,
  policy: OptimizationPolicy,
): readonly SpatialCellPlan[] {
  const position = new Vector3()
  const scale = new Vector3()
  const meshes = nodes.flatMap(node => {
    if (node.type !== 'mesh') return []
    const object = objectOf(node.id)
    if (!object) return [node]
    object.getWorldPosition(position)
    object.getWorldScale(scale)
    return [nodeAtWorld(node, position, scale)]
  })
  const cells = new Map<string, string[]>()
  for (const { cell, nodes: members } of adaptiveCellsOf(meshes, policy)) {
    cells.set(
      cellKeyOf(cell),
      members.map(node => node.id),
    )
  }
  const fallbackSize = maximumCellSize(policy)
  for (const node of nodes) {
    if (node.type === 'mesh') continue
    const object = objectOf(node.id)
    if (object) object.getWorldPosition(position)
    else
      position.set(node.transform.position.x, node.transform.position.y, node.transform.position.z)
    const key = cellKeyOf({
      size: fallbackSize,
      x: Math.floor(position.x / fallbackSize),
      y: Math.floor(position.y / fallbackSize),
      z: Math.floor(position.z / fallbackSize),
    })
    const sourceIds = cells.get(key)
    if (sourceIds) sourceIds.push(node.id)
    else cells.set(key, [node.id])
  }
  return [...cells]
    .map(([key, sourceIds]) => ({ key, sourceIds: sourceIds.sort(byCodeUnit) }))
    .sort((one, other) => byCodeUnit(one.key, other.key))
}

export function lossyCandidatesOf(
  nodes: readonly SceneNode[],
): Pick<Required<OptimizationPlan>, 'lodCandidates' | 'textureCandidates'> {
  const lodCandidates = nodes
    .filter(
      node =>
        node.optimization?.mode !== 'exclude' &&
        (node.type === 'mesh' || node.type === 'carved' || node.type === 'model'),
    )
    .map(node => ({ nodeId: node.id }))
    .sort((one, other) => byCodeUnit(one.nodeId, other.nodeId))
  const textures = new Set<string>()
  const protectedTextures = new Set<string>()
  for (const node of nodes) {
    if (node.type !== 'mesh' && node.type !== 'carved') continue
    const assetId = node.material.map?.assetId
    if (!assetId) continue
    ;(node.optimization?.mode === 'exclude' ? protectedTextures : textures).add(assetId)
  }
  for (const assetId of protectedTextures) textures.delete(assetId)
  return {
    lodCandidates,
    textureCandidates: [...textures].sort(byCodeUnit).map(assetId => ({ assetId })),
  }
}

export function analyzeLossyWorld(nodes: readonly SceneNode[]): LossyWorldPlan {
  return { nodeIds: lossyCandidatesOf(nodes).lodCandidates.map(candidate => candidate.nodeId) }
}

export function analyzeModelOptimization(
  root: Object3D,
  generateLods: boolean,
): readonly ModelOptimizationCandidate[] {
  const animated = animatedModelNodeNames(root)
  const candidates: ModelOptimizationCandidate[] = []
  let meshIndex = 0
  root.traverse(object => {
    if (!(object instanceof Mesh)) return
    const index = meshIndex
    meshIndex += 1
    const attributes = Object.keys(object.geometry.attributes)
    const color = object.geometry.getAttribute('color')
    if (
      !(object instanceof SkinnedMesh) &&
      !animated.has(object.name) &&
      (!generateLods || !hasLodAncestor(object)) &&
      Object.keys(object.geometry.morphAttributes).length === 0 &&
      !Array.isArray(object.material) &&
      attributes.every(attribute => SIMPLIFIED_MODEL_ATTRIBUTES.has(attribute)) &&
      (!color || color.itemSize === 3) &&
      object.geometry.drawRange.start === 0 &&
      object.geometry.drawRange.count === Infinity &&
      object.geometry.getAttribute('position')?.count > 3
    ) {
      candidates.push({ meshIndex: index, geometry: object.geometry })
    }
  })
  return candidates
}

const SIMPLIFIED_MODEL_ATTRIBUTES = new Set(['position', 'normal', 'uv', 'tangent', 'color'])

function hasLodAncestor(mesh: Mesh): boolean {
  let parent = mesh.parent
  while (parent) {
    if (parent instanceof LOD) return true
    parent = parent.parent
  }
  return false
}

function animatedModelNodeNames(root: Object3D): ReadonlySet<string> {
  const names = new Set<string>()
  for (const clip of root.animations) {
    for (const track of clip.tracks) {
      try {
        names.add(PropertyBinding.parseTrackName(track.name).nodeName)
      } catch {
        const all = new Set<string>()
        root.traverse(object => all.add(object.name))
        return all
      }
    }
  }
  return names
}

export function estimatedLossyImpact(
  plan: OptimizationPlan,
  options: LossyOptimization,
): LossyOptimizationImpact {
  const policy = DEFAULT_OPTIMIZATION_POLICY
  const geometryRatio = policy.simplificationRatios[options.geometrySimplification]
  const textureScale = policy.textureScale[options.textureReduction]
  const textureQuality =
    options.textureCompression === 'off' ? 1 : policy.jpegQuality[options.textureCompression] / 100
  return {
    trianglesAfter: Math.round(plan.measured.triangles * (1 - geometryRatio)),
    geometryBytesAfter: Math.round(plan.measured.geometryBytes * (1 - geometryRatio)),
    textureBytesAfter: Math.round(
      plan.measured.textureBytes * textureScale * textureScale * textureQuality,
    ),
  }
}

export function classificationsOf(
  node: SceneNode,
  object: Object3D | undefined,
  animated: boolean,
  meshes: readonly Mesh[],
): OptimizationClassification[] {
  const skinned = meshes.some(mesh => mesh instanceof SkinnedMesh)
  const dynamic =
    movesOnItsOwn(node.components) ||
    node.components?.some(component => component.type === 'Script') === true
  if (animated || dynamic || skinned) return unsafeClassifications(animated, dynamic, skinned)
  const classifications: OptimizationClassification[] = ['STATIC']
  if (!isInstancable(node, object)) return classifications
  classifications.push('INSTANCABLE', 'BATCHABLE')
  if (!node.components?.length && node.parentId === null) classifications.push('MERGEABLE')
  return classifications
}

function unsafeClassifications(
  animated: boolean,
  dynamic: boolean,
  skinned: boolean,
): OptimizationClassification[] {
  const classifications: OptimizationClassification[] = []
  if (dynamic) classifications.push('DYNAMIC')
  if (skinned) classifications.push('SKINNED')
  if (animated) classifications.push('ANIMATED')
  classifications.push('UNSAFE')
  return classifications
}

function isInstancable(node: SceneNode, object: Object3D | undefined): boolean {
  if (!object) return false
  if (node.type === 'mesh') return object instanceof Mesh && !(object instanceof SkinnedMesh)
  return node.type === 'model' && isInstanceable(object)
}

export function warningOf(
  classifications: readonly OptimizationClassification[],
): OptimizationWarning['reason'] | null {
  if (classifications.includes('SKINNED')) return 'skinned'
  if (classifications.includes('ANIMATED')) return 'animated'
  if (classifications.includes('DYNAMIC')) return 'dynamic'
  return null
}

export function* collectOwnMeshes(
  node: SceneNode,
  object: Object3D,
  meshes: Mesh[],
): Generator<void> {
  if (node.type === 'mesh') {
    if (object instanceof Mesh) meshes.push(object)
    yield
    return
  }
  if (node.type !== 'model') return

  const pending = [object]
  while (pending.length > 0) {
    const child = pending.pop()
    if (!child) continue
    if (child instanceof Mesh) meshes.push(child)
    for (let index = child.children.length - 1; index >= 0; index -= 1) {
      const descendant = child.children[index]
      if (descendant) pending.push(descendant)
    }
    yield
  }
}
