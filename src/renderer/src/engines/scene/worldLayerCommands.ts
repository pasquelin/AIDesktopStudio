import { inOrder } from '@shared/domain/order'
import type { WorldLayer } from '@shared/domain/scene'
import type { Command } from '../core/history'
import type { SceneState } from './sceneState'

export function editWorldLayers(
  id: string,
  change: (layers: readonly WorldLayer[]) => readonly WorldLayer[],
  refuses: (state: SceneState) => boolean,
): Command<SceneState> {
  let previous: readonly WorldLayer[] | null = null
  return {
    id,
    refuses,
    apply: state => {
      if (refuses(state)) return state
      previous = state.world.layers
      return { ...state, world: { ...state.world, layers: change(state.world.layers) } }
    },
    revert: state => (previous ? { ...state, world: { ...state.world, layers: previous } } : state),
  }
}

export function sameLayerOrder(
  items: readonly { id: string }[],
  next: readonly { id: string }[],
): boolean {
  return items.map(one => one.id).join() === next.map(one => one.id).join()
}

export function reorderWorldLayers(order: readonly string[]): Command<SceneState> {
  return editWorldLayers(
    'world:layers:reorder',
    layers => inOrder(layers, order),
    state => sameLayerOrder(state.world.layers, inOrder(state.world.layers, order)),
  )
}
