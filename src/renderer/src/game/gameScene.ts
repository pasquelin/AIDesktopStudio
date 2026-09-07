import {
  Color,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Scene,
  type Box3,
  type Camera,
  type BufferGeometry,
  type InstancedMesh,
  type Light,
  type Texture,
} from 'three'
import type { CsgGraph } from '@shared/domain/csg'
import type { ClipSource, ModelRef, SceneWorld } from '@shared/domain/scene'
import type { HeightmapSamples } from '@shared/domain/heightmap'
import { copyTransform, sameTransform, type Transform } from '@shared/domain/transform'
import type { AssetPort } from '@game/ports/assetPort'
import type {
  CompiledModelMesh,
  CompiledNodeGeometry,
  CompiledSceneOptimization,
} from '@shared/domain/gameExport'
import { uncutGeometry } from '@/engines/csg/uncutGeometry'
import type { createGeometryCache } from '@/engines/scene/geometryCache'
import { createGroundPlane } from '@/engines/scene/groundPlane'
import { applyFog } from '@/engines/scene/worldBinding'
import { lightFor, standTarget } from '@/engines/scene/threeSync'
import { behavioralGroupingExclusions, type ShadowThrow } from '@/engines/scene/grouping'
import { applyTransform, standsAt } from '@/engines/scene/pivot'
import type { SceneNode, SceneState } from '@/engines/scene/sceneState'
import { createOptimizedGroups } from '@/engines/scene/optimizedGrouping'
import { runtimeArtifactsOf, runtimeOptimizationOf } from '@/engines/scene/runtimeWorldCompiler'
import { drivenNodes } from '@/engines/scene/animationEval'
import { disposeTree, instanceOf, type ModelSource } from '@/engines/scene/modelCache'
import { geometryOfCompiledMesh } from '@/engines/scene/compiledGeometry'
import { loadModelAnimations } from './gameSceneClips'
import { createSceneResources, type SceneResources } from './gameSceneResources'
import { drapeWorld, type WorldDrape } from './gameSceneWorld'
import { dressShadows, lightsOf, shadowBoundsOf } from './gameSceneShadows'
import { firstPersonShadows } from './firstPersonShadows'
import { createFrameSettler, type GameFlush } from './gameSceneFrame'
import {
  createDress,
  materialOf,
  MESH_COLOUR,
  wearOcclusionUvs,
  type Dress,
} from './gameSceneMaterials'
import type { PosedClip } from '@game/ports/animationPort'
import type { Us } from '@shared/domain/time'
import {
  applyCompiledModel,
  applyGameTransform,
  instancedMeshesIn,
  rememberOwnLods,
  renderedGeometry,
} from './gameSceneOptimization'

/**
 * A scene as three.js draws it in a GAME — no gizmo, no helper, no selection, no grid.
 *
 * 🛑 Not `SceneRenderer`: that one is 4 500 lines of editor, and a game shipping it ships the
 * studio. What a game needs is the shapes, the lights and the sky.
 */
export type GameScene = {
  scene: Scene
  /** What the RENDERER has to settle rather than the scene graph — the tone mapping and exposure. */
  world: SceneWorld
  /** Where each entity's object is, so a step can place it without walking the tree. */
  byEntity: ReadonlyMap<string, Object3D>
  /** The scene's own lights — the nodes', as the editor reads them, never one an import brought. */
  lights: readonly Light[]
  /** What a shadow frustum is cut to — see `shadowBoundsOf`, which leaves the world out. */
  shadowBounds: Box3
  /**
   * Poses one entity, and answers whether that MOVED it. A game hands over every entity of the
   * world on every frame, moving or not — see `placementsOf` — so a caller that took the call
   * for a movement would find the scene changed sixty times a second in a level nobody walks.
   */
  place: (entityId: string, transform: Transform) => boolean
  /** What a state machine plays on one model, and how it gives it back — see `AnimationPort`. */
  pose: (nodeId: string, clips: readonly PosedClip[]) => void
  releasePose: (nodeId: string) => void
  clipLengthsOf: (nodeId: string) => Readonly<Record<string, number>>
  /**
   * Settles what a frame left stale — instanced bounds, scatter, the spatial cells the editor
   * follows from `dressPane`, the maps the moves owe — and answers what the frame owes. `cast` is
   * the last `throwsOf`, so a caster just out of frame still throws onto the ground.
   */
  flush: (camera: Camera, cast?: ShadowThrow | null) => GameFlush
  /** Poses what the head drives, and answers whether anything moved — see `flush`. */
  seek: (time: Us) => boolean
  dispose: () => void
}

/** What stands behind a scene whose backdrop is an environment a game does not ship. */
const NO_ENVIRONMENT = '#9fb2c8'

/** How a carved solid's shape is worked out — see `carver`. */
type Carve = (graph: CsgGraph) => BufferGeometry

export async function buildGameScene(
  state: SceneState,
  assets: AssetPort,
  optimization?: CompiledSceneOptimization,
  modelAssets?: Readonly<Record<string, readonly CompiledModelMesh[]>>,
  loadModel?: ModelSource,
  heightmaps?: ReadonlyMap<string, HeightmapSamples>,
  /** What a state machine plays on a node, beside whatever its band names — see `graphSourcesOf`. */
  clipsForNode?: (nodeId: string) => readonly ClipSource[],
): Promise<GameScene> {
  const compiled = new Map(optimization?.nodes.map(node => [node.nodeId, node]) ?? [])
  const needsCarver = state.nodes.some(
    node =>
      node.type === 'carved' && !compiled.get(node.id)?.mesh && !compiled.get(node.id)?.lodMeshes,
  )
  const carve = needsCarver ? await carver() : uncutGeometry
  const scene = new Scene()
  const byEntity = new Map<string, Object3D>()
  const placements = new Map<string, (transform: Transform) => boolean>()
  const resources = createSceneResources(state.animation)
  const dress = createDress(assets, resources)

  await populateScene(
    state.nodes,
    scene,
    byEntity,
    placements,
    compiled,
    resources.geometries.acquire,
    dress,
    carve,
    createModelOf(assets, loadModel, resources, clipsForNode),
    modelAssets,
    resources,
  )

  const drape = await drapeWorld(scene, state.world, assets, loadModel, heightmaps)
  return finalizeGameScene({
    state,
    optimization,
    scene,
    byEntity,
    placements,
    resources,
    drape,
  })
}

type FinalizeContext = {
  state: SceneState
  optimization: CompiledSceneOptimization | undefined
  scene: Scene
  byEntity: Map<string, Object3D>
  placements: Map<string, (transform: Transform) => boolean>
  resources: SceneResources
  drape: WorldDrape
}

function finalizeGameScene(context: FinalizeContext): GameScene {
  const { state, optimization, scene, byEntity, placements, resources, drape } = context
  const { animations } = resources
  scene.updateMatrixWorld()
  const instances = createOptimizedGroups(scene)
  const excluded = new Set(behavioralGroupingExclusions(state.nodes, drivenNodes(state.animation)))
  for (const node of optimization?.nodes ?? []) {
    if (node.lodGeometries || node.lodCarved) excluded.add(node.nodeId)
  }
  instances.rebuild(
    state.nodes,
    id => byEntity.get(id),
    excluded,
    runtimeOptimizationOf(state)?.artifacts ?? runtimeArtifactsOf(state.nodes, state.animation),
  )

  // 🛑 What a game shows of the world, and what it does NOT: the image-based environment is not
  // shipped, so `environment` falls back to a plain sky rather than to black. Written rather than
  // hidden — an exported scene lit only by its environment is a scene lit by nothing.
  scene.background = new Color(
    state.world.background.kind === 'color' ? state.world.background.color : NO_ENVIRONMENT,
  )
  applyFog(scene, state.world.fog)

  const ground = drape.hideGround ? null : createGroundPlane()
  if (ground) {
    ground.apply(state.world.ground, MESH_COLOUR)
    scene.add(ground.object)
  }

  const lights = lightsOf(state.nodes, byEntity)
  const shadowBounds = shadowBoundsOf(state.nodes, byEntity)
  const restorePlayer = firstPersonShadows(state, byEntity)
  const frame = createFrameSettler({ drape, instances, resources, lights, shadowBounds })
  return {
    scene,
    world: state.world,
    byEntity,
    lights,
    shadowBounds,
    place: (entityId, transform) => placements.get(entityId)?.(transform) ?? false,
    flush: (camera, cast = null) => frame.flush(camera, cast),
    seek: frame.seek,
    pose: frame.pose,
    releasePose: frame.releasePose,
    clipLengthsOf: nodeId => animations.lengthsOf(nodeId),
    dispose: () => {
      restorePlayer()
      animations.clear()
      instances.dispose()
      drape.dispose()
      ground?.dispose()
      for (const held of resources.textures.values()) void disposeWhenLoaded(held)
      for (const held of resources.models.values()) void disposeModelWhenLoaded(held)
      for (const geometry of resources.ownedModelGeometries) geometry.dispose()
      scene.traverse(one => {
        if (!(one instanceof Mesh)) return
        if (resources.modelMeshes.has(one)) return
        // 🛑 RELEASED, never disposed: the same buffers are drawn by every node of that shape.
        // A carved solid is cut for itself and no cache lends it, so it is freed here or never.
        if (resources.geometries.owns(one.geometry)) resources.geometries.release(one.geometry)
        else one.geometry.dispose()
        if (one.material instanceof MeshStandardMaterial) one.material.dispose()
      })
    },
  }
}

function createModelOf(
  assets: AssetPort,
  loadModel: ModelSource | undefined,
  resources: SceneResources,
  clipsForNode?: (nodeId: string) => readonly ClipSource[],
) {
  return async (
    nodeId: string,
    model: ModelRef,
    modelPlan: readonly CompiledModelMesh[] | undefined,
  ): Promise<Object3D | null> => {
    const url = assets.urlOf({ kind: 'asset', id: model.assetId })
    if (!url || !loadModel) return null
    try {
      const held = resources.models.get(model.assetId) ?? loadModel(url)
      resources.models.set(model.assetId, held)
      const source = await held
      const object = instanceOf(source)
      object.traverse(child => {
        if (child instanceof Mesh) resources.modelMeshes.add(child)
      })
      const optimized = applyCompiledModel(
        object,
        modelPlan,
        resources.ownedModelGeometries,
        resources.modelMeshes,
      )
      resources.animations.add(nodeId, optimized, source.animations)
      const wanted = clipsForNode?.(nodeId)
      await loadModelAnimations(nodeId, model, assets, loadModel, resources, wanted)
      resources.animations.apply(nodeId, model.lanes ?? [])
      return optimized
    } catch {
      return null
    }
  }
}

async function populateScene(
  nodes: readonly SceneNode[],
  scene: Scene,
  byEntity: Map<string, Object3D>,
  placements: Map<string, (transform: Transform) => boolean>,
  compiled: ReadonlyMap<string, CompiledNodeGeometry>,
  acquire: ReturnType<typeof createGeometryCache>['acquire'],
  dress: Dress,
  carve: Carve,
  modelOf: (
    nodeId: string,
    model: ModelRef,
    modelPlan: readonly CompiledModelMesh[] | undefined,
  ) => Promise<Object3D | null>,
  modelAssets: Readonly<Record<string, readonly CompiledModelMesh[]>> | undefined,
  resources: SceneResources,
): Promise<void> {
  const objects = await Promise.all(
    nodes.map(async node =>
      objectOf(node, compiled.get(node.id), acquire, dress, carve, modelOf, modelAssets),
    ),
  )
  for (const [index, node] of nodes.entries()) {
    const object = objects[index]
    if (!object) continue
    object.name = node.name
    object.visible = node.visible
    // Its OWN levels, before parenting hangs other nodes under it: a child rescales its own.
    rememberOwnLods(object)
    applyGameTransform(object, node.transform)
    byEntity.set(node.id, object)
    placements.set(node.id, transform => {
      if (standsAt(object, transform)) return false

      applyGameTransform(object, transform)
      resources.movedObjects.add(object)
      return true
    })
    registerBakedPlacements(node, object, byEntity, placements, resources.staleInstances)
  }
  for (const node of nodes) {
    const object = byEntity.get(node.id)
    if (!object) continue
    const parent = node.parentId === null ? null : byEntity.get(node.parentId)
    ;(parent ?? scene).add(object)
    standTarget(object, scene)
  }
  dressShadows(nodes, byEntity)
}

function registerBakedPlacements(
  node: SceneNode,
  object: Object3D,
  byEntity: Map<string, Object3D>,
  placements: Map<string, (transform: Transform) => boolean>,
  staleInstances: Set<InstancedMesh>,
): void {
  if (node.type !== 'mesh' || !node.instances) return
  const renderedInstances = instancedMeshesIn(object)
  const placement = new Object3D()
  // What each slot was last posed at: an instance has no object of its own to read it back off.
  const posed = new Map<string, Transform>()
  for (const [slot, instance] of node.instances.entries()) {
    byEntity.set(instance.sourceId, object)
    placements.set(instance.sourceId, transform => {
      const held = posed.get(instance.sourceId)
      if (held && sameTransform(held, transform)) return false

      posed.set(instance.sourceId, copyTransform(transform))
      applyTransform(placement, transform)
      placement.updateMatrix()
      for (const mesh of renderedInstances) {
        mesh.setMatrixAt(slot, placement.matrix)
        staleInstances.add(mesh)
      }
      return true
    })
  }
}

/** A texture still in flight when the scene went: awaited, then dropped. Never rejects. */
async function disposeWhenLoaded(held: Promise<Texture>): Promise<void> {
  try {
    ;(await held).dispose()
  } catch {
    // Never loaded, so there is nothing to release — and its failure was already reported.
  }
}

async function disposeModelWhenLoaded(held: Promise<Object3D>): Promise<void> {
  try {
    disposeTree(await held)
  } catch {
    // A model that never loaded owns no render resource to release.
  }
}

async function objectOf(
  node: SceneNode,
  compiled: CompiledNodeGeometry | undefined,
  acquire: ReturnType<typeof createGeometryCache>['acquire'],
  dress: Dress,
  carve: Carve,
  modelOf: (
    nodeId: string,
    model: ModelRef,
    modelPlan: readonly CompiledModelMesh[] | undefined,
  ) => Promise<Object3D | null>,
  modelAssets: Readonly<Record<string, readonly CompiledModelMesh[]>> | undefined,
): Promise<Object3D | null> {
  if (node.type === 'mesh') return meshObject(node, compiled, acquire, dress)
  if (node.type === 'carved') return carvedObject(node, compiled, carve, dress)
  if (node.type === 'light') return lightFor(node.light)
  if (node.type === 'model') {
    const modelPlan = compiled?.modelAssetId ? modelAssets?.[compiled.modelAssetId] : undefined
    return await modelOf(node.id, node.model, modelPlan)
  }
  // A group carries children. Cameras, paths, sprites and text belong to the editor renderer.
  return node.type === 'group' ? new Object3D() : null
}

function meshObject(
  node: Extract<SceneNode, { type: 'mesh' }>,
  compiled: CompiledNodeGeometry | undefined,
  acquire: ReturnType<typeof createGeometryCache>['acquire'],
  dress: Dress,
): Object3D {
  const descriptors = compiled?.lodGeometries ?? [compiled?.geometry ?? node.geometry]
  const object = renderedGeometry(
    descriptors.map(descriptor => acquire(descriptor, node.material.tilesPerMetre)),
    materialOf(node.material, dress),
    node.instances,
  )
  if (node.material.aoMap) wearOcclusionUvs(object)
  return object
}

function carvedObject(
  node: Extract<SceneNode, { type: 'carved' }>,
  compiled: CompiledNodeGeometry | undefined,
  carve: Carve,
  dress: Dress,
): Object3D {
  const geometries =
    compiled?.lodMeshes?.map(geometryOfCompiledMesh) ??
    (compiled?.mesh ? [geometryOfCompiledMesh(compiled.mesh)] : undefined)
  const graphs = geometries ? [] : (compiled?.lodCarved ?? [compiled?.carved ?? node.carved])
  const object = renderedGeometry(
    geometries ?? graphs.map(graph => carve(graph)),
    materialOf(node.material, dress),
  )
  if (node.material.aoMap) wearOcclusionUvs(object)
  return object
}

/**
 * How a solid is cut, loaded ONLY for a scene that carves: the evaluator weighs 174,6 kB of the
 * exported bundle (43,6 gzip), measured, and a game with no carved solid must not pay it.
 *
 * 🛑 It cuts on the game's own thread — 20 solids of four steps froze 300 ms, measured — and a
 * scene swap goes through here too. A worker is what this wants; ADR-25's uncut brush is what it
 * falls back on, here as in the studio.
 */
async function carver(): Promise<Carve> {
  try {
    const { geometryOfGraph } = await import('@/engines/csg/csgEvaluate')
    return graph => {
      try {
        return geometryOfGraph(graph)
      } catch {
        // 🛑 SILENT, and it is a declared hole: an exported page has no journal this module can
        // reach, so a cut that throws shows a doorway walled up with nothing said.
        return uncutGeometry(graph)
      }
    }
  } catch {
    // The chunk an export failed to ship. Same hole, one scale up: every solid comes out uncut.
    return uncutGeometry
  }
}
