/**
 * Terrain and edit-layer history. Sculpt swaps packed deltas of the touched chunks, never a
 * copy of the heightfield. Shares the scene stack — HISTORY_LIMIT = 100.
 */
import { inOrder } from '@shared/domain/order'
import {
  chunkPayload,
  withPackedChunks,
  type PackedReliefChunk,
  type ReliefMask,
  type ReliefSculpt,
} from '@shared/domain/relief'
import {
  reliefLayer,
  terrainEditLayer,
  type ReliefLayer,
  type TerrainEditLayer,
  type TerrainLocks,
  type TextureRef,
  type GroundMaterialLayer,
  type WorldLayer,
} from '@shared/domain/scene'
import { newId } from '@/helpers/ids'
import type { Command } from '../core/history'
import type { SceneState } from './sceneState'
import { editWorldLayers, reorderWorldLayers, sameLayerOrder } from './worldLayerCommands'

export function reorderTerrains(order: readonly string[]): Command<SceneState> {
  return reorderWorldLayers(order)
}

export function addTerrain(heightmap: TextureRef, id = newId()): Command<SceneState> {
  const layer = reliefLayer(heightmap, {
    id,
    edits: [terrainEditLayer({ id: 'sculpt' })],
  })
  return editWorldLayers(
    `world:layers:add:${id}`,
    layers => [...layers, layer],
    state => state.world.layers.some(one => one.id === id),
  )
}

export function removeTerrain(id: string): Command<SceneState> {
  return editWorldLayers(
    `world:layers:remove:${id}`,
    layers => layers.filter(layer => layer.id !== id),
    state => !terrainOf(state, id),
  )
}

export function renameTerrain(id: string, name: string): Command<SceneState> {
  return patchTerrain(`world:layers:rename:${id}`, id, { name })
}

export function setTerrainEnabled(id: string, enabled: boolean): Command<SceneState> {
  return patchTerrain(`world:layers:enabled:${id}`, id, { enabled })
}

export function setTerrainLocked(id: string, locked: TerrainLocks): Command<SceneState> {
  return patchTerrain(`world:layers:locks:${id}`, id, { locked })
}

export function setTerrainGroundMaterials(
  id: string,
  groundMaterials: readonly GroundMaterialLayer[],
): Command<SceneState> {
  return patchTerrain(`world:layers:${id}:groundMaterials`, id, { groundMaterials })
}

export function setTerrainGroundWeights(
  id: string,
  groundWeights: TextureRef | null,
): Command<SceneState> {
  return patchTerrain(`world:layers:${id}:groundWeights`, id, { groundWeights })
}

export function addTerrainEdit(terrainId: string, id = newId()): Command<SceneState> {
  const edit = terrainEditLayer({ id })
  return patchTerrainEdits(
    `world:layers:${terrainId}:edits:add:${id}`,
    terrainId,
    edits => [...edits, edit],
    terrain => terrain.edits.some(one => one.id === id),
  )
}

export function removeTerrainEdit(terrainId: string, editId: string): Command<SceneState> {
  return patchTerrainEdits(
    `world:layers:${terrainId}:edits:remove:${editId}`,
    terrainId,
    edits => edits.filter(edit => edit.id !== editId),
    terrain => {
      const edit = terrain.edits.find(one => one.id === editId)
      return !edit || edit.locked
    },
  )
}

export function renameTerrainEdit(
  terrainId: string,
  editId: string,
  name: string,
): Command<SceneState> {
  return patchOneEdit(
    `world:layers:${terrainId}:edits:rename:${editId}`,
    terrainId,
    editId,
    { name },
    edit => edit.locked,
  )
}

export function reorderTerrainEdits(
  terrainId: string,
  order: readonly string[],
): Command<SceneState> {
  return patchTerrainEdits(
    `world:layers:${terrainId}:edits:reorder`,
    terrainId,
    edits => inOrder(edits, order),
    terrain => {
      const next = inOrder(terrain.edits, order)
      if (sameLayerOrder(terrain.edits, next)) return true
      return terrain.edits.some((edit, at) => edit.locked && next[at]?.id !== edit.id)
    },
  )
}

export function setTerrainEditEnabled(
  terrainId: string,
  editId: string,
  enabled: boolean,
): Command<SceneState> {
  return patchOneEdit(`world:layers:${terrainId}:edits:enabled:${editId}`, terrainId, editId, {
    enabled,
  })
}

export function setTerrainEditLocked(
  terrainId: string,
  editId: string,
  locked: boolean,
): Command<SceneState> {
  return patchOneEdit(`world:layers:${terrainId}:edits:locked:${editId}`, terrainId, editId, {
    locked,
  })
}

export function setTerrainEditAlpha(
  terrainId: string,
  editId: string,
  alpha: number,
): Command<SceneState> {
  return patchOneEdit(
    `world:layers:${terrainId}:edits:alpha:${editId}`,
    terrainId,
    editId,
    { alpha },
    edit => edit.locked || !Number.isFinite(alpha),
  )
}

export function setTerrainEditMask(
  terrainId: string,
  editId: string,
  mask: ReliefMask | undefined,
): Command<SceneState> {
  return patchTerrainEdits(
    `world:layers:${terrainId}:edits:mask:${editId}`,
    terrainId,
    edits => edits.map(edit => (edit.id === editId ? terrainEditLayer({ ...edit, mask }) : edit)),
    terrain => {
      const edit = terrain.edits.find(one => one.id === editId)
      return !edit || edit.locked
    },
  )
}

export function paintTerrainEditMask(
  terrainId: string,
  editId: string,
  edits: readonly PackedReliefChunk[],
): Command<SceneState> {
  let held: { mask: ReliefMask | undefined } | null = null

  return {
    id: `world:layers:${terrainId}:edits:${editId}:mask:paint`,
    apply: state => {
      const target = targetedEdit(state, terrainId, editId)
      if (!target || paintBlocked(target)) return state
      held = { mask: target.edit.mask }
      return withEditMask(state, terrainId, editId, {
        kind: 'painted',
        weights: withPackedChunks(paintedWeightsOf(target.edit.mask), edits),
      })
    },
    revert: state => (held ? withEditMask(state, terrainId, editId, held.mask) : state),
    refuses: state => {
      const target = targetedEdit(state, terrainId, editId)
      if (!target || paintBlocked(target)) return true
      const weights = paintedWeightsOf(target.edit.mask)
      return edits.every(edit => chunkPayload(weights, edit.column, edit.row) === edit.payload)
    },
  }
}

function paintBlocked(target: { terrain: ReliefLayer; edit: TerrainEditLayer }): boolean {
  if (target.terrain.locked.sculpt || target.edit.locked) return true
  // A height or slope mask carries bounds a painted one cannot hold, and nothing on screen says
  // the mask brush is armed — so the brush refuses rather than converting silently. Held that way
  // until the masking feature is finished; converting and announcing it would be a window lot.
  return target.edit.mask !== undefined && target.edit.mask.kind !== 'painted'
}

function paintedWeightsOf(mask: ReliefMask | undefined): ReliefSculpt | undefined {
  return mask?.kind === 'painted' ? mask.weights : undefined
}

export function sculptRelief(
  terrainId: string,
  editId: string,
  edits: readonly PackedReliefChunk[],
): Command<SceneState> {
  let previous: PackedReliefChunk[] | null = null

  return {
    id: `world:layers:${terrainId}:edits:${editId}:sculpt`,
    apply: state => {
      const target = targetedEdit(state, terrainId, editId)
      if (!target || target.terrain.locked.sculpt || target.edit.locked) return state
      previous = edits.map(edit => ({
        column: edit.column,
        row: edit.row,
        payload: chunkPayload(target.edit.sculpt, edit.column, edit.row),
      }))
      return withEditSculpt(state, terrainId, editId, withPackedChunks(target.edit.sculpt, edits))
    },
    revert: state => {
      const target = targetedEdit(state, terrainId, editId)
      if (!target || !previous) return state
      return withEditSculpt(
        state,
        terrainId,
        editId,
        withPackedChunks(target.edit.sculpt, previous),
      )
    },
    refuses: state => {
      const target = targetedEdit(state, terrainId, editId)
      if (!target || target.terrain.locked.sculpt || target.edit.locked) return true
      return edits.every(
        edit => chunkPayload(target.edit.sculpt, edit.column, edit.row) === edit.payload,
      )
    },
  }
}

function patchTerrain(
  id: string,
  terrainId: string,
  patch: Partial<ReliefLayer>,
): Command<SceneState> {
  return editWorldLayers(
    id,
    layers => mapTerrain(layers, terrainId, terrain => ({ ...terrain, ...patch })),
    state => !terrainOf(state, terrainId),
  )
}

function patchTerrainEdits(
  id: string,
  terrainId: string,
  change: (edits: readonly TerrainEditLayer[]) => readonly TerrainEditLayer[],
  refuses: (terrain: ReliefLayer) => boolean,
): Command<SceneState> {
  return editWorldLayers(
    id,
    layers =>
      mapTerrain(layers, terrainId, terrain => ({ ...terrain, edits: change(terrain.edits) })),
    state => {
      const terrain = terrainOf(state, terrainId)
      return !terrain || refuses(terrain)
    },
  )
}

function patchOneEdit(
  id: string,
  terrainId: string,
  editId: string,
  patch: Partial<TerrainEditLayer>,
  refuses: (edit: TerrainEditLayer) => boolean = () => false,
): Command<SceneState> {
  return patchTerrainEdits(
    id,
    terrainId,
    edits => edits.map(edit => (edit.id === editId ? { ...edit, ...patch } : edit)),
    terrain => {
      const edit = terrain.edits.find(one => one.id === editId)
      return !edit || refuses(edit)
    },
  )
}

function terrainOf(state: SceneState, id: string): ReliefLayer | undefined {
  return state.world.layers.find(
    (layer): layer is ReliefLayer => layer.kind === 'relief' && layer.id === id,
  )
}

function targetedEdit(
  state: SceneState,
  terrainId: string,
  editId: string,
): { terrain: ReliefLayer; edit: TerrainEditLayer } | undefined {
  const terrain = terrainOf(state, terrainId)
  const edit = terrain?.edits.find(one => one.id === editId)
  return terrain && edit ? { terrain, edit } : undefined
}

function withEditMask(
  state: SceneState,
  terrainId: string,
  editId: string,
  mask: ReliefMask | undefined,
): SceneState {
  const layers = mapTerrain(state.world.layers, terrainId, terrain => ({
    ...terrain,
    edits: terrain.edits.map(edit =>
      edit.id === editId ? terrainEditLayer({ ...edit, mask }) : edit,
    ),
  }))
  return { ...state, world: { ...state.world, layers } }
}

function withEditSculpt(
  state: SceneState,
  terrainId: string,
  editId: string,
  sculpt: ReliefSculpt,
): SceneState {
  const layers = mapTerrain(state.world.layers, terrainId, terrain => ({
    ...terrain,
    edits: terrain.edits.map(edit =>
      edit.id === editId ? terrainEditLayer({ ...edit, sculpt }) : edit,
    ),
  }))
  return { ...state, world: { ...state.world, layers } }
}

function mapTerrain(
  layers: readonly WorldLayer[],
  terrainId: string,
  change: (terrain: ReliefLayer) => ReliefLayer,
): readonly WorldLayer[] {
  return layers.map(layer =>
    layer.kind === 'relief' && layer.id === terrainId ? change(layer) : layer,
  )
}
