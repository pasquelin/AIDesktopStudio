import { Matrix4, Mesh, type Intersection, type Material, type Object3D } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { batchKeyOf } from './batching'
import { heldOutOfDraw, trianglesOf, type InstancedGroups } from './grouping'
import type { RuntimeRenderArtifact } from './grouping'
import type { SceneNode } from './sceneState'

type FaceRange = { end: number; nodeId: string }
type MergeGroup = { ids: string[]; meshes: Mesh[]; material: Material }
type MergedGroup = { mesh: Mesh; ranges: readonly FaceRange[] }

export function createMergedGroups(
  host: Object3D,
  ownMaterialOf: (mesh: Mesh) => Material | Material[] = mesh => mesh.material,
): InstancedGroups {
  const drawn: Mesh[] = []
  const members = new WeakMap<Mesh, readonly FaceRange[]>()
  const sources = heldOutOfDraw()
  let keyOf = batchKeyOf(ownMaterialOf)
  let lastNodes: readonly SceneNode[] = []
  let lastArtifacts: readonly RuntimeRenderArtifact[] | undefined
  let lastExcluded: ReadonlySet<string> | undefined

  const clear = (): void => {
    for (const mesh of drawn) {
      mesh.removeFromParent()
      mesh.geometry.dispose()
    }
    drawn.length = 0
  }

  const regroup: InstancedGroups['rebuild'] = (nodes, objectOf, excluded, artifacts) => {
    lastNodes = nodes
    lastArtifacts = artifacts
    lastExcluded = excluded
    clear()
    let merged = 0
    const held: Mesh[] = []
    const byId = new Map(nodes.map(node => [node.id, node]))
    host.updateWorldMatrix(true, false)
    const worldToHost = new Matrix4().copy(host.matrixWorld).invert()
    for (const artifact of artifacts?.filter(one => one.strategy === 'merge') ?? []) {
      const groups = mergeGroupsOf(artifact, byId, objectOf, excluded, ownMaterialOf, keyOf)
      for (const group of groups) {
        const result = mergedGroupOf(group, worldToHost)
        if (!result) continue
        members.set(result.mesh, result.ranges)
        host.add(result.mesh)
        drawn.push(result.mesh)
        held.push(...group.meshes)
        merged += group.meshes.length
      }
    }
    sources.hold(held)
    return merged
  }

  return {
    // A keyer of its own per rebuild: `applyMaterial` mutates a three material in PLACE, and the
    // keyer answers by material identity — one kept across an edit would hand back a stale key.
    rebuild: (nodes, objectOf, excluded, artifacts) => {
      keyOf = batchKeyOf(ownMaterialOf)
      return regroup(nodes, objectOf, excluded, artifacts)
    },

    // The keyer is NOT remade here: a move changes transforms and nothing else, and this path runs
    // once per `pointermove` of a drag — where remaking it rehashes every pixel of every texture.
    moved: (ids, objectOf) => {
      const moved = [...ids].some(id => {
        const object = objectOf(id)
        return object ? sources.holds(object) : false
      })
      if (!moved) return false
      regroup(lastNodes, objectOf, lastExcluded, lastArtifacts)
      return true
    },
    drawn: () => drawn,
    pickable: () => drawn,
    editorPickable: () => drawn,
    editorSourceCount: () => 0,
    nodeIdOf: (hit: Intersection) => {
      if (!(hit.object instanceof Mesh) || hit.faceIndex === undefined || hit.faceIndex === null)
        return null
      const faceIndex = hit.faceIndex
      return members.get(hit.object)?.find(range => faceIndex < range.end)?.nodeId ?? null
    },
    ...sources.fields(clear),
  }
}

function mergeGroupsOf(
  artifact: RuntimeRenderArtifact,
  nodes: ReadonlyMap<string, SceneNode>,
  objectOf: (id: string) => Object3D | undefined,
  excluded: ReadonlySet<string> | undefined,
  materialOf: (mesh: Mesh) => Material | Material[],
  keyOf: (node: SceneNode, mesh: Mesh) => string,
): readonly MergeGroup[] {
  const groups = new Map<string, MergeGroup>()
  for (const id of artifact.sourceIds) {
    const node = nodes.get(id)
    const mesh = objectOf(id)
    if (!node || !(mesh instanceof Mesh) || excluded?.has(id)) continue
    const material = materialOf(mesh)
    if (Array.isArray(material)) continue
    const key = keyOf(node, mesh)
    const group = groups.get(key)
    if (group) {
      group.ids.push(id)
      group.meshes.push(mesh)
    } else groups.set(key, { ids: [id], meshes: [mesh], material })
  }
  return [...groups.values()].filter(group => group.meshes.length >= 2)
}

function mergedGroupOf(group: MergeGroup, worldToHost: Matrix4): MergedGroup | null {
  const geometries = group.meshes.map(mesh =>
    mesh.geometry
      .clone()
      .applyMatrix4(new Matrix4().multiplyMatrices(worldToHost, mesh.matrixWorld)),
  )
  const geometry = mergeGeometries(geometries, false)
  for (const source of geometries) source.dispose()
  if (!geometry) return null
  const mesh = new Mesh(geometry, group.material)
  mesh.matrixAutoUpdate = false
  mesh.castShadow = group.meshes[0]?.castShadow ?? false
  mesh.receiveShadow = group.meshes[0]?.receiveShadow ?? false
  return { mesh, ranges: faceRangesOf(group) }
}

function faceRangesOf(group: MergeGroup): readonly FaceRange[] {
  const ranges: FaceRange[] = []
  let end = 0
  for (const [index, source] of group.meshes.entries()) {
    end += trianglesOf(source.geometry)
    const nodeId = group.ids[index]
    if (nodeId) ranges.push({ end, nodeId })
  }
  return ranges
}
