import type { BufferGeometry, Material, Mesh, Texture } from 'three'
import { stableKey } from '@shared/hash'
import type { OptimizationPolicy } from '@shared/domain/optimizationPolicy'
import { behavioralGroupingExclusions, shapeAndPaint, withFlags } from './grouping'
import { batchKeyOf } from './batching'
import { EMPTY_STATS, geometryArraysOf, statsOf, textureBytesOf, texturesOf } from './sceneStats'
import {
  GEOMETRY_CONTENT,
  MATERIAL_CONTENT,
  textureContent,
  type ResourceContent,
} from './resourceContent'
import type { SceneNode, SceneState } from './sceneState'
import type { ClassifiedObject, OptimizationWarning } from './worldAnalyzerTypes'

type CandidateGroup = { ids: Set<string>; units: Set<string>; forced: boolean }
type ContentGroup<T> = {
  canonical: T
  key: string
  sourceIds: Set<string>
  uses: number
}

export function createAnalysis(
  state: Pick<SceneState, 'nodes' | 'animation'>,
  runtimeNodes: readonly SceneNode[],
  policy: OptimizationPolicy,
) {
  const animated = new Set(state.animation.tracks.map(track => track.target.nodeId))
  const maxContentBytes = policy.maxSynchronousContentBytes
  const excluded = behavioralGroupingExclusions(runtimeNodes, animated)
  return {
    animated,
    maxContentBytes,
    excluded,
    drawn: new Set<Mesh>(),
    seenStats: { geometries: new Set<unknown>(), textures: new Set<unknown>() },
    sceneStats: { ...EMPTY_STATS },
    geometryArrays: new Set<ArrayBufferView>(),
    geometryGroups: new Map<string, ContentGroup<BufferGeometry>[]>(),
    identityGeometryGroups: new WeakMap<BufferGeometry, ContentGroup<BufferGeometry>>(),
    largeGeometryGroups: emptyList<ContentGroup<BufferGeometry>>(),
    materialGroups: new Map<string, ContentGroup<Material>[]>(),
    textureGroups: new Map<string, ContentGroup<Texture>[]>(),
    geometryKeys: new WeakMap<BufferGeometry, string>(),
    materialKeys: new WeakMap<Material, string>(),
    textureKeys: new WeakMap<Texture, string>(),
    opaqueTextureUses: new Map<Texture, number>(),
    geometryBytes: 0,
    avoidedGeometryBytes: 0,
    avoidedTextureBytes: 0,
    sharedMaterialUses: 0,
    candidateGroups: new Map<string, CandidateGroup>(),
    batchGroups: new Map<string, CandidateGroup>(),
    keyOf: withFlags(shapeAndPaint()),
    batchKey: batchKeyOf(),
    classifications: emptyList<ClassifiedObject>(),
    warnings: emptyList<OptimizationWarning>(),
    visibleObjects: 0,
  }
}

function emptyList<T>(): T[] {
  return []
}

export type Analysis = ReturnType<typeof createAnalysis>

export function collectMesh(nodeId: string, mesh: Mesh, analysis: Analysis): void {
  analysis.drawn.add(mesh)
  const added = statsOf([mesh], analysis.seenStats)
  analysis.sceneStats.triangles += added.triangles
  analysis.sceneStats.vertices += added.vertices
  analysis.sceneStats.draws += added.draws
  analysis.sceneStats.textureBytes += added.textureBytes
  collectGeometry(nodeId, mesh.geometry, analysis)
  const worn = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
  for (const material of worn) collectMaterial(nodeId, material, analysis)
}

function collectGeometry(nodeId: string, geometry: BufferGeometry, analysis: Analysis): void {
  const group =
    geometryByteLength(geometry) <= analysis.maxContentBytes
      ? collectContent(
          analysis.geometryGroups,
          analysis.geometryKeys,
          geometry,
          nodeId,
          GEOMETRY_CONTENT,
        )
      : collectIdentity(
          analysis.identityGeometryGroups,
          analysis.largeGeometryGroups,
          geometry,
          nodeId,
          'geometry',
        )
  if (group.uses > 1) analysis.avoidedGeometryBytes += geometryByteLength(geometry)
  for (const array of geometryArraysOf(geometry)) {
    if (analysis.geometryArrays.has(array)) continue
    analysis.geometryArrays.add(array)
    analysis.geometryBytes += array.byteLength
  }
}

function collectMaterial(nodeId: string, material: Material, analysis: Analysis): void {
  if (
    collectContent(
      analysis.materialGroups,
      analysis.materialKeys,
      material,
      nodeId,
      MATERIAL_CONTENT,
    ).uses > 1
  ) {
    analysis.sharedMaterialUses += 1
  }
  for (const texture of texturesOf(material)) {
    const content = textureContent(texture, analysis.maxContentBytes)
    const uses = content
      ? collectContent(analysis.textureGroups, analysis.textureKeys, texture, nodeId, content).uses
      : countIdentity(analysis.opaqueTextureUses, texture)
    if (uses > 1) analysis.avoidedTextureBytes += textureBytesOf(texture)
  }
}

export function collectNodeCandidates(
  node: SceneNode,
  mesh: Mesh,
  unit: string,
  analysis: Analysis,
): void {
  collectCandidate(analysis.candidateGroups, analysis.keyOf(node, mesh), node, unit, 'instance')
  collectCandidate(analysis.batchGroups, analysis.batchKey(node, mesh), node, unit, 'batch')
}

function collectContent<T extends object>(
  groups: Map<string, ContentGroup<T>[]>,
  keys: WeakMap<T, string>,
  resource: T,
  nodeId: string,
  content: ResourceContent<T>,
): ContentGroup<T> {
  const held = keys.get(resource)
  const key = held ?? content.key(resource)
  if (held === undefined) keys.set(resource, key)
  const bucket = groups.get(key) ?? []
  let group = bucket.find(
    candidate => candidate.canonical === resource || content.equals(candidate.canonical, resource),
  )
  if (!group) {
    group = { canonical: resource, key: `${key}:${bucket.length}`, sourceIds: new Set(), uses: 0 }
    bucket.push(group)
    groups.set(key, bucket)
  }
  group.sourceIds.add(nodeId)
  group.uses += 1
  return group
}

function collectIdentity<T extends object>(
  groups: WeakMap<T, ContentGroup<T>>,
  list: ContentGroup<T>[],
  resource: T,
  nodeId: string,
  kind: string,
): ContentGroup<T> {
  let group = groups.get(resource)
  if (!group) {
    group = {
      canonical: resource,
      key: stableKey([kind, list.length]),
      sourceIds: new Set(),
      uses: 0,
    }
    groups.set(resource, group)
    list.push(group)
  }
  group.sourceIds.add(nodeId)
  group.uses += 1
  return group
}

function countIdentity<T>(uses: Map<T, number>, resource: T): number {
  const count = (uses.get(resource) ?? 0) + 1
  uses.set(resource, count)
  return count
}

function collectCandidate(
  groups: Map<string, CandidateGroup>,
  key: string,
  node: SceneNode,
  unit: string,
  forcedMode: 'instance' | 'batch',
): void {
  const group = groups.get(key)
  if (group) {
    group.ids.add(node.id)
    group.units.add(unit)
    group.forced ||= node.optimization?.mode === forcedMode
    return
  }
  groups.set(key, {
    ids: new Set([node.id]),
    units: new Set([unit]),
    forced: node.optimization?.mode === forcedMode,
  })
}

export function geometryByteLength(geometry: BufferGeometry): number {
  return geometryArraysOf(geometry).reduce((bytes, array) => bytes + array.byteLength, 0)
}
