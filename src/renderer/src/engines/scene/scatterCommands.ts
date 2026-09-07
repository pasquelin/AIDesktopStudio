import {
  chunkPayload,
  withPackedChunks,
  type PackedReliefChunk,
  type ReliefMask,
  type ReliefSculpt,
} from '@shared/domain/relief'
import {
  scatterLayer,
  type ScatterCategory,
  type ScatterLayer,
  type ScatterRules,
} from '@shared/domain/scene'
import { newId } from '@/helpers/ids'
import type { Command } from '../core/history'
import type { SceneState } from './sceneState'
import { editWorldLayers, reorderWorldLayers } from './worldLayerCommands'

export function reorderScatters(order: readonly string[]): Command<SceneState> {
  return reorderWorldLayers(order)
}

export function addScatter(id = newId()): Command<SceneState> {
  const layer = scatterLayer({ id })
  return editWorldLayers(
    `world:layers:add:${id}`,
    layers => [...layers, layer],
    state => state.world.layers.some(one => one.id === id),
  )
}

export function removeScatter(id: string): Command<SceneState> {
  return editWorldLayers(
    `world:layers:remove:${id}`,
    layers => layers.filter(layer => layer.id !== id),
    state => !scatterOf(state, id),
  )
}

export function renameScatter(id: string, name: string): Command<SceneState> {
  return patchScatter(`world:layers:rename:${id}`, id, { name })
}

export function setScatterEnabled(id: string, enabled: boolean): Command<SceneState> {
  return patchScatter(`world:layers:enabled:${id}`, id, { enabled })
}

export function setScatterLocked(id: string, locked: boolean): Command<SceneState> {
  return patchScatter(`world:layers:locks:${id}`, id, { locked })
}

export function setScatterRules(id: string, rules: ScatterRules): Command<SceneState> {
  return patchScatter(`world:layers:${id}:rules`, id, { rules }, layer => layer.locked)
}

export function setScatterSeed(id: string, seed: number): Command<SceneState> {
  return patchScatter(`world:layers:${id}:seed`, id, { seed }, layer => layer.locked)
}

export function setScatterAssets(id: string, assets: ScatterLayer['assets']): Command<SceneState> {
  return patchScatter(`world:layers:${id}:assets`, id, { assets }, layer => layer.locked)
}

export function setScatterCategory(id: string, category: ScatterCategory): Command<SceneState> {
  return patchScatter(`world:layers:${id}:category`, id, { category }, layer => layer.locked)
}

export function setScatterCollision(id: string, collision: boolean): Command<SceneState> {
  return patchScatter(
    `world:layers:${id}:collision`,
    id,
    { collision },
    layer => layer.locked || layer.category === 'grass',
  )
}

export function setScatterFollowRelief(
  id: string,
  followRelief: ScatterLayer['followRelief'],
): Command<SceneState> {
  return patchScatter(
    `world:layers:${id}:followRelief`,
    id,
    { followRelief },
    layer => layer.locked,
  )
}

export function setScatterMask(id: string, mask: ReliefMask | undefined): Command<SceneState> {
  return patchScatter(`world:layers:${id}:mask`, id, { mask }, layer => layer.locked)
}

export function paintScatterMask(
  id: string,
  edits: readonly PackedReliefChunk[],
): Command<SceneState> {
  let held: { mask: ReliefMask | undefined } | null = null

  return {
    id: `world:layers:${id}:mask:paint`,
    apply: state => {
      const layer = scatterOf(state, id)
      if (!layer || paintBlocked(layer)) return state
      held = { mask: layer.mask }
      return withScatterMask(state, id, {
        kind: 'painted',
        weights: withPackedChunks(paintedWeightsOf(layer.mask), edits),
      })
    },
    revert: state => (held ? withScatterMask(state, id, held.mask) : state),
    refuses: state => {
      const layer = scatterOf(state, id)
      if (!layer || paintBlocked(layer)) return true
      const weights = paintedWeightsOf(layer.mask)
      return edits.every(edit => chunkPayload(weights, edit.column, edit.row) === edit.payload)
    },
  }
}

function paintBlocked(layer: ScatterLayer): boolean {
  if (layer.locked) return true
  return layer.mask !== undefined && layer.mask.kind !== 'painted'
}

function paintedWeightsOf(mask: ReliefMask | undefined): ReliefSculpt | undefined {
  return mask?.kind === 'painted' ? mask.weights : undefined
}

function patchScatter(
  id: string,
  scatterId: string,
  patch: Partial<ScatterLayer>,
  refuses: (layer: ScatterLayer) => boolean = () => false,
): Command<SceneState> {
  return editWorldLayers(
    id,
    layers =>
      layers.map(layer =>
        layer.kind === 'scatter' && layer.id === scatterId
          ? scatterLayer({ ...layer, ...patch })
          : layer,
      ),
    state => {
      const layer = scatterOf(state, scatterId)
      return !layer || refuses(layer)
    },
  )
}

function withScatterMask(state: SceneState, id: string, mask: ReliefMask | undefined): SceneState {
  const layers = state.world.layers.map(layer => {
    if (layer.kind !== 'scatter' || layer.id !== id) return layer
    return scatterLayer({ ...layer, mask })
  })
  return { ...state, world: { ...state.world, layers } }
}

function scatterOf(state: SceneState, id: string): ScatterLayer | undefined {
  return state.world.layers.find(
    (layer): layer is ScatterLayer => layer.kind === 'scatter' && layer.id === id,
  )
}
