/**
 * The relief a scene draws: one BufferGeometry per chunk, so a sculpt stroke re-uploads only
 * the chunks it dirtied — `addUpdateRange` on position and normal, never computeVertexNormals.
 */
import {
  BufferAttribute,
  Group,
  MeshStandardMaterial,
  type Mesh,
  type Object3D,
  type Scene,
} from 'three'
import type { HeightmapSamples } from '@shared/domain/heightmap'
import {
  chunkCountAlong,
  chunkLayout,
  reliefReader,
  type ReliefChunkKey,
  type ReliefChunkLayout,
  type ReliefExtent,
  type ReliefRead,
} from '@shared/domain/relief'
import { enabledTerrains } from '@shared/domain/scene'
import type { ReliefLayer, SceneWorld, TerrainEditLayer } from '@shared/domain/scene'
import { loadHeightmap } from './heightmap'
import type { ReliefBuilder } from './reliefBuilder'
import type { ReliefGeometryData } from './reliefBuildMessage'
import { reliefGeometryData, writeChunkNormals, writeChunkRegion } from './reliefSurfaceGeometry'
import { addReliefChunk, showMaskTint, writeMaskOverlay } from './reliefMaskOverlay'
import { blendChanged, dirtiedChunks } from './reliefSurfaceEdits'
import { reliefSculptSourceOf, type ReliefSculptSource } from './reliefSculptSource'
import type { GroundPaint } from '@shared/domain/groundPaint'
import type { TextureSource } from './textureCache'
import { applyGroundPaint, disposeGroundMaterial, syncGroundMaterial } from './reliefGroundMaterial'

export { reliefGeometryData } from './reliefSurfaceGeometry'
export type { ReliefSculptSource } from './reliefSculptSource'

export type ReliefSurface = {
  object: Object3D
  sync: (world: SceneWorld, samples?: HeightmapSamples) => void
  heightmaps: () => ReadonlyMap<string, HeightmapSamples>
  meshOf: (terrainId: string, column: number, row: number) => Mesh | undefined
  sculptSource: (terrainId: string, editId: string) => ReliefSculptSource | null
  paintGround?: (terrainId: string, paint: GroundPaint) => void
  holdGroundPaint?: (hold: boolean) => void
  /** Draws the painted-mask tint, or hides it, and hands back whether it was shown before. */
  showMaskTint?: (shown: boolean) => boolean
  dispose: () => void
}

/** Group name of one terrain, which a ray walks up from a chunk mesh. */
export function terrainIdOfObject(object: Object3D): string | null {
  let current: Object3D | null = object
  while (current) {
    if (current.name.startsWith('relief-') && !current.name.startsWith('relief-chunk-')) {
      return current.name.slice('relief-'.length)
    }
    current = current.parent
  }
  return null
}

export type ReliefSurfaceOptions = {
  load?: (assetId: string) => Promise<HeightmapSamples>
  builder?: ReliefBuilder
  onReady?: () => void
  onFailure?: (assetId: string, error: unknown) => void
  loadGround?: TextureSource
  assetVersion?: (assetId: string) => string | undefined
  /** Off unless the studio asks: the tint is a working aid, and a played scene has no workshop. */
  maskTint?: boolean
}

const RELIEF_NAME = 'scene-relief'

type Held = {
  assetId: string
  samples: HeightmapSamples
  extent: ReliefExtent
  grain: number
  edits: readonly TerrainEditLayer[]
}

type SampleRect = { minX: number; maxX: number; minZ: number; maxZ: number }

type TerrainSurface = {
  group: Group
  meshes: Map<string, Mesh>
  held: Held | null
  /** The heightmap a load is under way for, so a second sync does not start it over. */
  loading: string | null
  /** The last layer asked for, which a load that started before it must still honour. */
  wanted: ReliefLayer | null
  generation: number
  buildAbort: AbortController | null
  material: MeshStandardMaterial
  groundAssetId: string | null
  groundGeneration: number
}

type SurfaceState = {
  group: Group
  material: MeshStandardMaterial
  terrains: Map<string, TerrainSurface>
  options: ReliefSurfaceOptions
  load: (assetId: string) => Promise<HeightmapSamples>
  builder: ReliefBuilder | undefined
  keepLiveWeights: boolean
}

export function createReliefSurface(
  scene: Scene,
  options: ReliefSurfaceOptions = {},
): ReliefSurface {
  const state: SurfaceState = {
    group: new Group(),
    material: new MeshStandardMaterial({
      roughness: 0.9,
      metalness: 0,
      vertexColors: options.maskTint === true,
    }),
    terrains: new Map(),
    options,
    load: options.load ?? (assetId => loadHeightmap(assetId)),
    builder: options.builder,
    keepLiveWeights: false,
  }
  state.group.name = RELIEF_NAME
  scene.add(state.group)
  return {
    object: state.group,
    sync: (world, samples) => syncRelief(state, world, samples),
    heightmaps: () =>
      new Map(
        [...state.terrains.values()].flatMap(terrain =>
          terrain.held ? [[terrain.held.assetId, terrain.held.samples]] : [],
        ),
      ),
    meshOf: (terrainId, column, row) =>
      state.terrains.get(terrainId)?.meshes.get(keyOf(column, row)),
    sculptSource: (terrainId, editId) => {
      const held = state.terrains.get(terrainId)?.held
      const edit = held?.edits.find(candidate => candidate.id === editId)
      return held && edit ? reliefSculptSourceOf(held, edit) : null
    },
    paintGround: (terrainId, paint) => applyGroundPaint(state.terrains.get(terrainId), paint),
    holdGroundPaint: hold => {
      state.keepLiveWeights = hold
    },
    showMaskTint: shown =>
      tinting(state) && showMaskTint(state.material, state.terrains.values(), shown),
    dispose: () => disposeRelief(state),
  }
}

function syncRelief(state: SurfaceState, world: SceneWorld, samples?: HeightmapSamples): void {
  const wanted = enabledTerrains(world.layers)
  const ids = new Set(wanted.map(layer => layer.id))
  for (const [id, terrain] of [...state.terrains]) {
    if (!ids.has(id)) dropTerrain(state, id, terrain)
  }
  for (const layer of wanted) {
    const terrain = terrainSurfaceOf(state, layer)
    terrain.wanted = layer
    if (samples) {
      applyLayer(state, terrain, layer, samples)
      continue
    }
    if (terrain.held?.assetId === layer.heightmap.assetId) {
      applyLayer(state, terrain, layer, terrain.held.samples)
      continue
    }
    // Restarting a load in flight bumped the generation, so the answer about to land was thrown
    // away and a large heightmap was read again from the top on every world change.
    if (terrain.loading === layer.heightmap.assetId) continue
    void loadLayer(state, terrain, layer)
  }
}

function terrainSurfaceOf(state: SurfaceState, layer: ReliefLayer): TerrainSurface {
  const held = state.terrains.get(layer.id)
  if (held) return held
  const terrain: TerrainSurface = {
    group: new Group(),
    meshes: new Map(),
    held: null,
    loading: null,
    wanted: null,
    generation: 0,
    buildAbort: null,
    material: state.material.clone(),
    groundAssetId: null,
    groundGeneration: 0,
  }
  terrain.group.name = `relief-${layer.id}`
  state.terrains.set(layer.id, terrain)
  return terrain
}

function dropTerrain(state: SurfaceState, id: string, terrain: TerrainSurface): void {
  terrain.generation += 1
  terrain.groundGeneration += 1
  terrain.buildAbort?.abort()
  clearMeshes(terrain.meshes)
  disposeGroundMaterial(terrain)
  terrain.material.dispose()
  terrain.group.removeFromParent()
  state.terrains.delete(id)
}

function applyLayer(
  state: SurfaceState,
  terrain: TerrainSurface,
  layer: ReliefLayer,
  samples: HeightmapSamples,
): boolean {
  syncGroundMaterial(terrain, layer, {
    ...state.options,
    keepLiveWeights: state.keepLiveWeights,
  })
  const extent: ReliefExtent = {
    origin: layer.origin,
    size: layer.size,
    elevation: layer.elevation,
  }
  if (needsRebuild(terrain.held, samples, layer.grain, extent, layer.edits)) {
    if (state.builder) {
      void buildMeshesAway(state, terrain, state.builder, layer, samples, extent)
      return false
    }
    clearMeshes(terrain.meshes)
    buildMeshes(state, terrain, samples, extent, layer.grain, layer.edits)
  } else {
    dropPendingBuild(terrain)
    patchMeshes(state, terrain, samples, extent, terrain.held?.edits ?? [], layer)
  }
  terrain.held = {
    assetId: layer.heightmap.assetId,
    samples,
    extent,
    grain: layer.grain,
    edits: layer.edits,
  }
  return true
}

/**
 * A build in flight was computed for edits this call has just replaced — an alpha moved and moved
 * back is enough. Left alone it landed with a token still current and painted the older surface
 * over the one being drawn.
 */
function dropPendingBuild(terrain: TerrainSurface): void {
  if (!terrain.buildAbort) return
  terrain.generation += 1
  terrain.buildAbort.abort()
  terrain.buildAbort = null
}

async function buildMeshesAway(
  state: SurfaceState,
  terrain: TerrainSurface,
  builder: ReliefBuilder,
  layer: ReliefLayer,
  samples: HeightmapSamples,
  extent: ReliefExtent,
): Promise<void> {
  terrain.buildAbort?.abort()
  const abort = new AbortController()
  terrain.buildAbort = abort
  const token = ++terrain.generation
  try {
    const chunks = await builder.build(samples, extent, layer.grain, layer.edits, abort.signal)
    if (!chunks || token !== terrain.generation) return
    clearMeshes(terrain.meshes)
    buildMeshesFromData(state, terrain, chunks, samples, layer.grain, layer.edits)
    terrain.held = {
      assetId: layer.heightmap.assetId,
      samples,
      extent,
      grain: layer.grain,
      edits: layer.edits,
    }
    state.options.onReady?.()
  } catch (error) {
    if (token === terrain.generation) state.options.onFailure?.(layer.heightmap.assetId, error)
  } finally {
    if (terrain.buildAbort === abort) terrain.buildAbort = null
  }
}

function needsRebuild(
  held: Held | null,
  samples: HeightmapSamples,
  grain: number,
  extent: ReliefExtent,
  edits: readonly TerrainEditLayer[],
): boolean {
  if (!held || held.samples !== samples || held.grain !== grain) return true
  if (blendChanged(held.edits, edits)) return true
  return (
    held.extent.origin.x !== extent.origin.x ||
    held.extent.origin.z !== extent.origin.z ||
    held.extent.size.x !== extent.size.x ||
    held.extent.size.z !== extent.size.z ||
    held.extent.elevation.min !== extent.elevation.min ||
    held.extent.elevation.max !== extent.elevation.max
  )
}

async function loadLayer(
  state: SurfaceState,
  terrain: TerrainSurface,
  layer: ReliefLayer,
): Promise<void> {
  const token = ++terrain.generation
  terrain.loading = layer.heightmap.assetId
  try {
    const samples = await state.load(layer.heightmap.assetId)
    if (token !== terrain.generation) return
    const asked =
      terrain.wanted?.heightmap.assetId === layer.heightmap.assetId ? terrain.wanted : layer
    if (applyLayer(state, terrain, asked, samples)) state.options.onReady?.()
  } catch (error) {
    if (token !== terrain.generation) return
    dropTerrain(state, layer.id, terrain)
    state.options.onFailure?.(layer.heightmap.assetId, error)
  } finally {
    // Not on the token: applying the layer starts a worker build, which bumps `generation`
    // BEFORE this runs — read there, the mark stayed and no heightmap was ever read again.
    if (terrain.loading === layer.heightmap.assetId) terrain.loading = null
  }
}

/** A played scene never asks for the tint, so its chunks skip an overlay nothing would sample. */
function tinting(state: SurfaceState): boolean {
  return state.options.maskTint === true
}

function disposeRelief(state: SurfaceState): void {
  for (const [id, terrain] of [...state.terrains]) dropTerrain(state, id, terrain)
  state.builder?.dispose()
  state.material.dispose()
  state.group.removeFromParent()
}

function buildMeshes(
  state: SurfaceState,
  terrain: TerrainSurface,
  samples: HeightmapSamples,
  extent: ReliefExtent,
  grain: number,
  edits: readonly TerrainEditLayer[],
): void {
  const columns = chunkCountAlong(samples.width, grain)
  const rows = chunkCountAlong(samples.height, grain)
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const layout = chunkLayout(column, row, samples.width, samples.height, grain)
      addReliefChunk(
        terrain,
        reliefGeometryData(samples, extent, layout, grain, edits),
        samples,
        grain,
        tinting(state) ? edits : [],
      )
    }
  }
  if (terrain.group.parent !== state.group) state.group.add(terrain.group)
}

function buildMeshesFromData(
  state: SurfaceState,
  terrain: TerrainSurface,
  chunks: readonly ReliefGeometryData[],
  samples: HeightmapSamples,
  grain: number,
  edits: readonly TerrainEditLayer[],
): void {
  const tint = tinting(state) ? edits : []
  for (const chunk of chunks) addReliefChunk(terrain, chunk, samples, grain, tint)
  if (terrain.group.parent !== state.group) state.group.add(terrain.group)
}

function patchMeshes(
  state: SurfaceState,
  terrain: TerrainSurface,
  samples: HeightmapSamples,
  extent: ReliefExtent,
  before: readonly TerrainEditLayer[],
  layer: ReliefLayer,
): void {
  const { grain, edits: after } = layer
  for (const mesh of terrain.meshes.values()) clearChunkRanges(mesh)
  const edits = dirtiedChunks(before, after)
  const beforeRead = reliefReader(samples, grain, before, extent)
  const afterRead = reliefReader(samples, grain, after, extent)
  const dirty = new Map<string, { layout: ReliefChunkLayout; rect: SampleRect }>()

  for (const { column, row } of edits) {
    const mesh = terrain.meshes.get(keyOf(column, row))
    if (!mesh) continue
    const layout = chunkLayout(column, row, samples.width, samples.height, grain)
    const rect = changedRect(layout, beforeRead, afterRead)
    writeMaskOverlay(mesh.geometry, samples, layout, grain, tinting(state) ? after : [])
    if (!rect) continue
    dirty.set(keyOf(column, row), { layout, rect })
    writeChunkRegion(mesh.geometry, samples, extent, layout, afterRead, rect)
  }

  // 🛑 A normal reads the 1-ring around its vertex, and that ring CROSSES the chunk border: the
  // neighbour's own edge column is lit by heights this stroke just moved. Left alone it kept the
  // lighting of before — a crease down every seam a brush came near, and one that never healed.
  // Its normals only: nothing moved on that side, so its positions are already true.
  for (const key of borderingChunks(dirty, samples, grain)) {
    const mesh = terrain.meshes.get(keyOf(key.column, key.row))
    if (!mesh) continue
    const layout = chunkLayout(key.column, key.row, samples.width, samples.height, grain)
    writeChunkNormals(mesh.geometry, samples, extent, layout, grain, after)
  }
}

/** The chunks touching a dirtied one, the dirtied ones themselves left out. */
function borderingChunks(
  dirty: ReadonlyMap<string, { layout: ReliefChunkLayout; rect: SampleRect }>,
  samples: HeightmapSamples,
  grain: number,
): ReliefChunkKey[] {
  const columns = chunkCountAlong(samples.width, grain)
  const rows = chunkCountAlong(samples.height, grain)
  const around = new Map<string, ReliefChunkKey>()

  for (const [key, { layout, rect }] of dirty) {
    const [column, row] = key.split(':').map(Number)
    if (column === undefined || row === undefined) continue

    const candidates = [
      ...(rect.minX <= 1 ? [{ column: column - 1, row }] : []),
      ...(rect.maxX >= layout.width - 2 ? [{ column: column + 1, row }] : []),
      ...(rect.minZ <= 1 ? [{ column, row: row - 1 }] : []),
      ...(rect.maxZ >= layout.height - 2 ? [{ column, row: row + 1 }] : []),
    ]
    for (const near of candidates) {
      const outside = near.column < 0 || near.column >= columns || near.row < 0 || near.row >= rows
      if (outside || dirty.has(keyOf(near.column, near.row))) continue
      around.set(keyOf(near.column, near.row), near)
    }
  }
  return [...around.values()]
}

function changedRect(
  layout: ReliefChunkLayout,
  before: ReliefRead,
  after: ReliefRead,
): SampleRect | null {
  let rect: SampleRect | null = null
  for (let z = 0; z < layout.height; z++) {
    for (let x = 0; x < layout.width; x++) {
      const sampleX = layout.sampleX + x
      const sampleZ = layout.sampleZ + z
      if (before(sampleX, sampleZ) === after(sampleX, sampleZ)) continue
      if (!rect) rect = { minX: x, maxX: x, minZ: z, maxZ: z }
      else {
        rect.minX = Math.min(rect.minX, x)
        rect.maxX = Math.max(rect.maxX, x)
        rect.minZ = Math.min(rect.minZ, z)
        rect.maxZ = Math.max(rect.maxZ, z)
      }
    }
  }
  return rect
}

function clearChunkRanges(mesh: Mesh): void {
  const position = mesh.geometry.getAttribute('position')
  const normal = mesh.geometry.getAttribute('normal')
  const color = mesh.geometry.getAttribute('color')
  if (position instanceof BufferAttribute) position.clearUpdateRanges()
  if (normal instanceof BufferAttribute) normal.clearUpdateRanges()
  if (color instanceof BufferAttribute) color.clearUpdateRanges()
}

function keyOf(column: number, row: number): string {
  return `${column}:${row}`
}

function clearMeshes(meshes: Map<string, Mesh>): void {
  for (const mesh of meshes.values()) {
    mesh.geometry.dispose()
    mesh.removeFromParent()
  }
  meshes.clear()
}
