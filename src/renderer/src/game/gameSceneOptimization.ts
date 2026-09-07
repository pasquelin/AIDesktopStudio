import {
  InstancedMesh,
  LOD,
  Mesh,
  Object3D,
  type BufferGeometry,
  type MeshStandardMaterial,
} from 'three'
import type { CompiledModelMesh } from '@shared/domain/gameExport'
import { DEFAULT_OPTIMIZATION_POLICY } from '@shared/domain/optimizationPolicy'
import type { Transform } from '@shared/domain/transform'
import type { BakedInstance } from '@/engines/scene/sceneState'
import { bakedInstancesOf } from '@/engines/scene/bakedInstances'
import { geometryOfCompiledMesh } from '@/engines/scene/compiledGeometry'
import { applyTransform } from '@/engines/scene/pivot'

const BASE_LOD_DISTANCES = new WeakMap<LOD, readonly number[]>()

/**
 * The levels a node's OWN subtree holds, read once at build time. `traverse` per placement is a
 * whole imported model walked per entity per frame, and a subtree with no level is the common case.
 */
const OWN_LODS = new WeakMap<Object3D, readonly LOD[]>()

/** The scale those distances were last written for: an entity that has not resized rewrites none. */
const LOD_SCALE = new WeakMap<Object3D, number>()

export function applyCompiledModel(
  root: Object3D,
  plan: readonly CompiledModelMesh[] | undefined,
  owned: Set<BufferGeometry>,
  modelMeshes: WeakSet<Mesh>,
): Object3D {
  if (!plan) return root
  const meshes = meshesIn(root)
  let optimized = root
  for (const item of plan) {
    const mesh = meshes[item.meshIndex]
    if (!mesh) continue
    optimized = applyCompiledMesh(optimized, mesh, item, owned, modelMeshes)
  }
  return optimized
}

function meshesIn(root: Object3D): Mesh[] {
  const meshes: Mesh[] = []
  root.traverse(object => {
    if (object instanceof Mesh) meshes.push(object)
  })
  return meshes
}

function applyCompiledMesh(
  root: Object3D,
  mesh: Mesh,
  item: CompiledModelMesh,
  owned: Set<BufferGeometry>,
  modelMeshes: WeakSet<Mesh>,
): Object3D {
  if (item.geometry) {
    const geometry = geometryOfCompiledMesh(item.geometry)
    mesh.geometry = geometry
    owned.add(geometry)
    return root
  }
  if (!item.lodMeshes?.length) return root
  const replacesRoot = mesh.parent === null
  const lod = createModelLod(mesh)
  addLodLevels(
    lod,
    item.lodMeshes.map(compiled => compiledLevel(mesh, compiled, owned, modelMeshes)),
    mesh.geometry.boundingSphere?.radius ?? 1,
  )
  return replacesRoot ? lod : root
}

function createModelLod(mesh: Mesh): LOD {
  const parent = mesh.parent
  const lod = new LOD()
  lod.name = mesh.name
  lod.position.copy(mesh.position)
  lod.quaternion.copy(mesh.quaternion)
  lod.scale.copy(mesh.scale)
  mesh.position.set(0, 0, 0)
  mesh.quaternion.identity()
  mesh.scale.set(1, 1, 1)
  if (parent) parent.add(lod)
  lod.addLevel(mesh, 0)
  mesh.geometry.computeBoundingSphere()
  return lod
}

function compiledLevel(
  source: Mesh,
  compiled: NonNullable<CompiledModelMesh['lodMeshes']>[number],
  owned: Set<BufferGeometry>,
  modelMeshes: WeakSet<Mesh>,
): Mesh {
  const geometry = geometryOfCompiledMesh(compiled)
  owned.add(geometry)
  const level = new Mesh(geometry, source.material)
  modelMeshes.add(level)
  level.castShadow = source.castShadow
  level.receiveShadow = source.receiveShadow
  return level
}

export function renderedGeometry(
  geometries: readonly BufferGeometry[],
  material: MeshStandardMaterial,
  baked?: readonly BakedInstance[],
): Object3D {
  const levels = geometries.map(geometry =>
    baked ? bakedInstancesOf(geometry, material, baked) : new Mesh(geometry, material),
  )
  const exact = levels[0]
  if (levels.length === 1) return exact ?? new Object3D()
  const lod = new LOD()
  const radius = radiusOf(exact, geometries[0])
  if (exact) lod.addLevel(exact, 0)
  addLodLevels(lod, levels.slice(1), radius)
  return lod
}

function radiusOf(level: Object3D | undefined, geometry: BufferGeometry | undefined): number {
  if (level instanceof InstancedMesh) {
    level.computeBoundingSphere()
    return level.boundingSphere?.radius ?? 1
  }
  geometry?.computeBoundingSphere()
  return geometry?.boundingSphere?.radius ?? 1
}

/**
 * The DISTANT levels of a shape whose exact one the caller has already added at zero, and the base
 * distances a scaled entity reads back.
 *
 * 🛑 The multipliers are the runtime's own, not the artifact's: an export compiled under one policy
 * and played by a build whose policy moved switches level at distances unrelated to its ratios. The
 * fix is a distance written into `CompiledMeshGeometry` at export time, which the lossy compilers
 * this file does not own would have to emit.
 */
function addLodLevels(lod: LOD, levels: readonly Object3D[], radius: number): void {
  for (const [index, level] of levels.entries())
    lod.addLevel(level, radius * (DEFAULT_OPTIMIZATION_POLICY.lodDistanceMultipliers[index] ?? 1))
  BASE_LOD_DISTANCES.set(
    lod,
    lod.levels.map(level => level.distance),
  )
}

/**
 * Indexes what a node's own subtree holds, BEFORE parenting hangs other nodes under it — so each
 * node rescales its own levels. The old `traverse` also rewrote its parented children's, from the
 * PARENT's scale, and the last node placed in the frame won.
 */
export function rememberOwnLods(object: Object3D): void {
  const found: LOD[] = []
  object.traverse(child => {
    if (child instanceof LOD) found.push(child)
  })
  OWN_LODS.set(object, found)
}

export function applyGameTransform(object: Object3D, transform: Transform): void {
  applyTransform(object, transform)
  const lods = OWN_LODS.get(object)
  if (!lods || lods.length === 0) return

  // Spelled out: `Object.values(…).map` allocated two arrays per moved entity per frame.
  const scale = Math.max(
    Math.abs(transform.scale.x),
    Math.abs(transform.scale.y),
    Math.abs(transform.scale.z),
  )
  if (LOD_SCALE.get(object) === scale) return

  LOD_SCALE.set(object, scale)
  for (const lod of lods) {
    const distances = BASE_LOD_DISTANCES.get(lod)
    if (!distances) continue
    lod.levels.forEach((level, index) => {
      level.distance = (distances[index] ?? level.distance) * scale
    })
  }
}

export function instancedMeshesIn(object: Object3D): readonly InstancedMesh[] {
  const meshes: InstancedMesh[] = []
  object.traverse(child => {
    if (child instanceof InstancedMesh) meshes.push(child)
  })
  return meshes
}
