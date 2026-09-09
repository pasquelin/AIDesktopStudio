import { localizedError } from '@shared/localizedError'
import { Group, InstancedMesh, type Camera, type Object3D, type Scene } from 'three'
import {
  enabledScatters,
  enabledTerrains,
  SCATTER_CATEGORIES,
  type ReliefLayer,
  type ScatterCategory,
  type ScatterLayer,
  type SceneWorld,
} from '@shared/domain/scene'
import type { HeightmapSamples } from '@shared/domain/heightmap'
import {
  scatterPosesOf,
  type ScatterGround,
  type ScatterRegion,
} from '@shared/domain/scatterGenerate'
import { scatterGroundOf, scatterTerrainsOf } from '@shared/domain/scatterGround'
import {
  layerRegion,
  scatterLayerRebuildOf,
  scatterRebuildOf,
  type ScatterRebuild,
} from '@shared/domain/scatterFollow'
import { blendChanged, dirtiedChunks } from './reliefSurfaceEdits'
import { scatterBatchesOf, scatterCellSize, scatterDrawnOf } from './scatterRender'
import {
  buildPartition,
  cellCoords,
  cellKey,
  type CellKey,
  type WorldPartition,
} from './worldPartition'
import { modelKeyOf, type ModelCache } from './modelCache'
import { clipsOf } from './animation'
import { meshesOf } from './instanceableModel'
import { rigStateOf } from './rigState'
import { updateScatterVisibility } from './scatterVisibility'

export type ScatterSurface = {
  object: Object3D
  partition: WorldPartition
  sync: (world: SceneWorld, heightmaps?: ReadonlyMap<string, HeightmapSamples>) => Promise<void>
  updateVisibility: (camera: Camera) => boolean
  objectsInCell: (layerId: string, key: CellKey) => readonly Object3D[]
  dispose: () => void
}

type ScatterSurfaceOptions = {
  models: ModelCache
  onUnsupported: (assetId: string, status: string) => void
  onReady?: () => void
}

type ScatterAssets = {
  revision: number
  sources: Map<string, Object3D>
  held: Set<string>
  loading: Map<string, Promise<Object3D | null>>
}

type ScatterCells = {
  byLayer: Map<string, { category: ScatterCategory; cells: Map<CellKey, Object3D[]> }>
  references: Map<ScatterCategory, Map<CellKey, number>>
  partitions: Map<ScatterCategory, WorldPartition>
  group: Group
  queried: Map<ScatterCategory, CellKey[]>
  wanted: Map<ScatterCategory, Set<CellKey>>
  visibility: { x: number; z: number; revision: number }
  revision: number
}

type ScatterState = {
  assets: ScatterAssets
  cells: ScatterCells
  world: SceneWorld | null
  grounded: Set<string>
  syncing: Promise<void>
  disposed: boolean
}

export function createScatterSurface(scene: Scene, options: ScatterSurfaceOptions): ScatterSurface {
  const group = new Group()
  group.name = 'scene-scatter'
  scene.add(group)
  const state: ScatterState = {
    assets: { revision: 0, sources: new Map(), held: new Set(), loading: new Map() },
    cells: {
      byLayer: new Map(),
      references: new Map(SCATTER_CATEGORIES.map(category => [category, new Map()])),
      partitions: new Map(
        SCATTER_CATEGORIES.map(category => [category, buildPartition(scatterCellSize(category))]),
      ),
      group,
      queried: new Map(SCATTER_CATEGORIES.map(category => [category, []])),
      wanted: new Map(SCATTER_CATEGORIES.map(category => [category, new Set()])),
      visibility: { x: 0, z: 0, revision: -1 },
      revision: 0,
    },
    world: null,
    grounded: new Set(),
    syncing: Promise.resolve(),
    disposed: false,
  }
  return {
    object: group,
    get partition() {
      const partition = state.cells.partitions.get('props')
      if (!partition) throw localizedError('scatterPartitionMissing')
      return partition
    },
    sync: async (world, heightmaps) => {
      const previous = state.syncing
      let release = (): void => {}
      state.syncing = new Promise(resolve => {
        release = resolve
      })
      // The release covers the disposed exit too: a sync that returns without it strands every
      // sync queued behind it on a lock nothing will ever open.
      try {
        await previous
        if (state.disposed) return
        await syncScatter(state, world, heightmaps, options)
      } finally {
        release()
      }
    },
    updateVisibility: camera => updateScatterVisibility(state.cells, camera),
    objectsInCell: (layerId, key) => state.cells.byLayer.get(layerId)?.cells.get(key) ?? [],
    dispose: () => {
      state.disposed = true
      disposeScatter(state, options.models)
    },
  }
}

async function syncScatter(
  state: ScatterState,
  world: SceneWorld,
  heightmaps: ReadonlyMap<string, HeightmapSamples> | undefined,
  options: ScatterSurfaceOptions,
): Promise<void> {
  const previous = state.world
  dropRemovedLayers(state.cells, new Set(enabledScatters(world.layers).map(layer => layer.id)))
  const jobs = enabledScatters(world.layers).map(layer => {
    const before = previous ? scatterLayerOf(previous, layer.id) : undefined
    if (before && scatterCellsMoved(before, layer)) dropLayer(state.cells, layer.id)
    const layerRebuild: ScatterRebuild = before
      ? scatterLayerRebuildOf(before, layer)
      : { kind: 'all' }
    const reliefRebuild: ScatterRebuild = previous
      ? reliefRebuildOf(layer, previous, world, heightmaps, state.grounded)
      : { kind: 'none' }
    const rebuild = mergeRebuild(layerRebuild, reliefRebuild)
    return { layer, rebuild }
  })
  for (const { layer, rebuild } of jobs) {
    for (const key of keysToRebuild(layer, rebuild)) dropCell(state.cells, layer.id, key)
  }
  const revision = await reconcileSources(world, state.assets, options)
  if (revision !== state.assets.revision) return
  const ground = scatterGroundOf(scatterTerrainsOf(world, heightmaps ?? new Map()))
  for (const { layer, rebuild } of jobs) {
    rebuildLayer(state.cells, layer, rebuild, ground, state.assets.sources)
  }
  rememberGrounded(state.grounded, world, heightmaps)
  state.world = world
  options.onReady?.()
}

function keysToRebuild(layer: ScatterLayer, rebuild: ScatterRebuild): readonly CellKey[] {
  if (rebuild.kind === 'none') return []
  const cellSize = scatterCellSize(layer.category)
  return rebuild.kind === 'all'
    ? cellKeysIn(layerRegion(layer), cellSize)
    : cellKeysIn(intersection(layerRegion(layer), rebuild.region), cellSize)
}

function rebuildLayer(
  cells: ScatterCells,
  layer: ScatterLayer,
  rebuild: ScatterRebuild,
  ground: ScatterGround,
  sources: ReadonlyMap<string, Object3D>,
): void {
  for (const key of keysToRebuild(layer, rebuild)) rebuildCell(cells, layer, key, ground, sources)
}

function rebuildCell(
  cells: ScatterCells,
  layer: ScatterLayer,
  key: CellKey,
  ground: ScatterGround,
  sources: ReadonlyMap<string, Object3D>,
): void {
  dropCell(cells, layer.id, key)
  const cellSize = scatterCellSize(layer.category)
  const poses = scatterPosesOf(
    layer,
    intersection(layerRegion(layer), cellRegion(key, cellSize)),
    ground,
  )
  const drawn: Object3D[] = []
  for (const batch of scatterBatchesOf(poses, () => key, cellSize, layer.category, layer.seed)) {
    const source = sources.get(batch.assetId)
    if (!source) continue
    for (const mesh of meshesOf(source)) drawn.push(scatterDrawnOf(batch, mesh))
  }
  if (drawn.length === 0) return
  for (const object of drawn) cells.group.add(object)
  const layerCells = cells.byLayer.get(layer.id) ?? {
    category: layer.category,
    cells: new Map<CellKey, Object3D[]>(),
  }
  layerCells.cells.set(key, drawn)
  cells.byLayer.set(layer.id, layerCells)
  holdCell(cells, layer.category, key)
}

function reliefRebuildOf(
  layer: ScatterLayer,
  before: SceneWorld,
  after: SceneWorld,
  heightmaps: ReadonlyMap<string, HeightmapSamples> | undefined,
  grounded: ReadonlySet<string>,
): ScatterRebuild {
  if (layer.followRelief !== 'none' && reliefGroundChanged(before, after)) return { kind: 'all' }
  let rebuild: ScatterRebuild = { kind: 'none' }
  for (const terrain of enabledTerrains(after.layers)) {
    const previous = reliefLayerOf(before, terrain.id)
    const samples = heightmaps?.get(terrain.heightmap.assetId)
    if (samples && !grounded.has(terrain.id)) return { kind: 'all' }
    if (!previous || !samples) continue
    const next = scatterRebuildOf(
      layer.followRelief,
      dirtiedChunks(previous.edits, terrain.edits),
      { ...terrain, samples },
    )
    if (next.kind === 'all') return next
    if (next.kind === 'brush') rebuild = mergeRebuild(rebuild, next)
  }
  return rebuild
}

function scatterCellsMoved(before: ScatterLayer, after: ScatterLayer): boolean {
  return (
    before.category !== after.category ||
    before.origin.x !== after.origin.x ||
    before.origin.z !== after.origin.z ||
    before.size.x !== after.size.x ||
    before.size.z !== after.size.z
  )
}

function reliefGroundChanged(before: SceneWorld, after: SceneWorld): boolean {
  const previous = new Map(
    before.layers
      .filter((layer): layer is ReliefLayer => layer.kind === 'relief')
      .map(layer => [layer.id, layer]),
  )
  const next = new Map(
    after.layers
      .filter((layer): layer is ReliefLayer => layer.kind === 'relief')
      .map(layer => [layer.id, layer]),
  )
  for (const id of new Set([...previous.keys(), ...next.keys()])) {
    const left = previous.get(id)
    const right = next.get(id)
    if (!left || !right) {
      if (left?.enabled || right?.enabled) return true
      continue
    }
    if (left.enabled !== right.enabled) return true
    if (!right.enabled) continue
    if (reliefLayerChanged(left, right)) return true
  }
  return false
}

function reliefLayerChanged(left: ReliefLayer, right: ReliefLayer): boolean {
  return (
    left.heightmap.assetId !== right.heightmap.assetId ||
    left.origin.x !== right.origin.x ||
    left.origin.z !== right.origin.z ||
    left.size.x !== right.size.x ||
    left.size.z !== right.size.z ||
    left.elevation.min !== right.elevation.min ||
    left.elevation.max !== right.elevation.max ||
    left.grain !== right.grain ||
    blendChanged(left.edits, right.edits)
  )
}

function mergeRebuild(left: ScatterRebuild, right: ScatterRebuild): ScatterRebuild {
  if (left.kind === 'all' || right.kind === 'all') return { kind: 'all' }
  if (left.kind === 'none') return right
  if (right.kind === 'none') return left
  return {
    kind: 'brush',
    region: {
      minX: Math.min(left.region.minX, right.region.minX),
      minZ: Math.min(left.region.minZ, right.region.minZ),
      maxX: Math.max(left.region.maxX, right.region.maxX),
      maxZ: Math.max(left.region.maxZ, right.region.maxZ),
    },
  }
}

function cellKeysIn(region: ScatterRegion, cellSize: number): CellKey[] {
  if (region.minX >= region.maxX || region.minZ >= region.maxZ) return []
  const keys: CellKey[] = []
  const minX = Math.floor(region.minX / cellSize)
  const maxX = Math.ceil(region.maxX / cellSize)
  const minZ = Math.floor(region.minZ / cellSize)
  const maxZ = Math.ceil(region.maxZ / cellSize)
  for (let x = minX; x < maxX; x += 1) {
    for (let z = minZ; z < maxZ; z += 1) keys.push(cellKey(x, z))
  }
  return keys
}

function cellRegion(key: CellKey, cellSize: number): ScatterRegion {
  const { cx, cz } = cellCoords(key)
  return {
    minX: cx * cellSize,
    minZ: cz * cellSize,
    maxX: (cx + 1) * cellSize,
    maxZ: (cz + 1) * cellSize,
  }
}

function intersection(left: ScatterRegion, right: ScatterRegion): ScatterRegion {
  return {
    minX: Math.max(left.minX, right.minX),
    minZ: Math.max(left.minZ, right.minZ),
    maxX: Math.min(left.maxX, right.maxX),
    maxZ: Math.min(left.maxZ, right.maxZ),
  }
}

function holdCell(cells: ScatterCells, category: ScatterCategory, key: CellKey): void {
  const references = cells.references.get(category)
  const count = references?.get(key) ?? 0
  if (count === 0) cells.partitions.get(category)?.hold(key)
  references?.set(key, count + 1)
  cells.revision += 1
}

function dropCell(cells: ScatterCells, layerId: string, key: CellKey): void {
  const layerCells = cells.byLayer.get(layerId)
  if (!layerCells) return
  const objects = layerCells.cells.get(key)
  if (!objects) return
  for (const object of objects) disposeDrawn(object)
  layerCells.cells.delete(key)
  if (layerCells.cells.size === 0) cells.byLayer.delete(layerId)
  const references = cells.references.get(layerCells.category)
  const count = (references?.get(key) ?? 1) - 1
  if (count <= 0) {
    references?.delete(key)
    cells.partitions.get(layerCells.category)?.release(key)
  } else references?.set(key, count)
  cells.revision += 1
}

function dropRemovedLayers(cells: ScatterCells, wanted: ReadonlySet<string>): void {
  for (const layerId of [...cells.byLayer.keys()]) {
    if (wanted.has(layerId)) continue
    dropLayer(cells, layerId)
  }
}

function dropLayer(cells: ScatterCells, layerId: string): void {
  const layerCells = cells.byLayer.get(layerId)
  if (!layerCells) return
  for (const key of [...layerCells.cells.keys()]) dropCell(cells, layerId, key)
}

async function reconcileSources(
  world: SceneWorld,
  assets: ScatterAssets,
  options: ScatterSurfaceOptions,
): Promise<number> {
  const revision = ++assets.revision
  const wanted = new Set(
    enabledScatters(world.layers).flatMap(layer => layer.assets.map(asset => asset.assetId)),
  )
  releaseRemoved(wanted, assets, options.models)
  for (const assetId of wanted) {
    if (assets.sources.has(assetId)) continue
    const source = await sourceOf(assetId, assets, options.models)
    if (source && assets.held.has(assetId) && acceptsScatterSource(assetId, source, options)) {
      source.updateWorldMatrix(false, true)
      assets.sources.set(assetId, source)
    }
  }
  return revision
}

function sourceOf(
  assetId: string,
  assets: ScatterAssets,
  models: ModelCache,
): Promise<Object3D | null> {
  const loading = assets.loading.get(assetId)
  if (loading) return loading
  assets.held.add(assetId)
  // Unversioned on purpose: the scatter does not read a rewritten model again — see its test.
  const acquired = models.acquire(modelKeyOf(assetId))
  assets.loading.set(assetId, acquired)
  return acquired
}

function releaseRemoved(
  wanted: ReadonlySet<string>,
  assets: ScatterAssets,
  models: ModelCache,
): void {
  for (const assetId of [...assets.held]) {
    if (wanted.has(assetId)) continue
    assets.held.delete(assetId)
    assets.sources.delete(assetId)
    assets.loading.delete(assetId)
    models.release(modelKeyOf(assetId))
  }
}

function acceptsScatterSource(
  assetId: string,
  source: Object3D,
  options: ScatterSurfaceOptions,
): boolean {
  const clips = clipsOf(source)
  const status = rigStateOf(source, clips).status
  if (status === 'staticMesh' && clips.length === 0) return true
  options.onUnsupported(assetId, clips.length > 0 ? 'animatedModel' : status)
  return false
}

function scatterLayerOf(world: SceneWorld, id: string): ScatterLayer | undefined {
  const layer = world.layers.find(candidate => candidate.id === id)
  return layer?.kind === 'scatter' ? layer : undefined
}

function reliefLayerOf(world: SceneWorld, id: string): ReliefLayer | undefined {
  const layer = world.layers.find(candidate => candidate.id === id)
  return layer?.kind === 'relief' ? layer : undefined
}

function rememberGrounded(
  grounded: Set<string>,
  world: SceneWorld,
  heightmaps: ReadonlyMap<string, HeightmapSamples> | undefined,
): void {
  grounded.clear()
  for (const terrain of enabledTerrains(world.layers)) {
    if (heightmaps?.get(terrain.heightmap.assetId)) grounded.add(terrain.id)
  }
}

function disposeDrawn(object: Object3D): void {
  object.traverse(child => {
    if (child instanceof InstancedMesh) child.dispose()
  })
  object.removeFromParent()
}

function disposeScatter(state: ScatterState, models: ModelCache): void {
  state.assets.revision += 1
  for (const object of [...state.cells.group.children]) disposeDrawn(object)
  for (const assetId of state.assets.held) models.release(modelKeyOf(assetId))
  state.assets.held.clear()
  state.assets.sources.clear()
  state.assets.loading.clear()
  for (const [category, references] of state.cells.references) {
    for (const key of references.keys()) state.cells.partitions.get(category)?.release(key)
  }
  state.cells.byLayer.clear()
  state.cells.references.clear()
  state.grounded.clear()
}
