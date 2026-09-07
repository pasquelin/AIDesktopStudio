import { DEFAULT_MATERIAL, type SceneNode, type SceneState } from '@/engines/scene/sceneState'
import { refused, type ActionOutcome } from '@shared/domain/assistant'
import { DEFAULT_WORLD } from '@shared/domain/scene'
import {
  apartFrom,
  cuesLaid,
  mostWanted,
  mounted,
  moved,
  NO_SCENE,
  shapeApart,
  someOrNone,
  unlessBare,
} from './sceneHandlerCore'

function trackSummary(track: SceneState['animation']['tracks'][number]): Record<string, unknown> {
  // Defaults are omitted: three tracks otherwise cost 47 characters each, and a two-track scene
  // answered only one when asked to remove just its rotation animation.
  return {
    id: track.id,
    name: track.name,
    index: track.index,
    ...(track.muted ? { muted: true } : {}),
    ...(track.solo ? { solo: true } : {}),
    ...(track.locked ? { locked: true } : {}),
    target: track.target,
    keys: track.keys.map(key => key.time),
  }
}

function nodeKindSummary(node: SceneNode): Record<string, unknown> {
  if (node.type === 'mesh') {
    return {
      geometry: shapeApart(node.geometry),
      ...unlessBare('material', apartFrom(node.material, DEFAULT_MATERIAL)),
    }
  }
  if (node.type === 'light') return { light: node.light }
  if (node.type === 'model') return { model: node.model }
  if (node.type === 'camera') return { camera: node.camera }
  if (node.type === 'path') return { path: node.path }
  if (node.type !== 'carved') return {}
  return {
    carved: node.carved,
    ...unlessBare('material', apartFrom(node.material, DEFAULT_MATERIAL)),
  }
}

function nodeSummary(node: SceneNode): Record<string, unknown> {
  // A moved node used to spend 78 characters on untouched rotation and scale. An identity
  // transform alone cost 118 characters per node and made a three-object answer lose all nodes.
  return {
    id: node.id,
    name: node.name,
    type: node.type,
    ...(node.parentId === null ? {} : { parentId: node.parentId }),
    ...(node.visible ? {} : { visible: false }),
    ...(moved(node.transform) ?? {}),
    ...nodeKindSummary(node),
  }
}

function stateSummary(documentId: string, state: SceneState): Record<string, unknown> {
  /**
   * ID-bearing members come first. Raising the result ceiling twice changed the bench score by
   * nothing; reducing this answer made the scene readable. Empty lists stay absent so an
   * unanimated scene gives its nodes the full result budget.
   */
  return {
    documentId,
    selectedIds: state.selectedIds,
    fps: state.animation.fps,
    duration: state.animation.duration,
    ...someOrNone('shots', state.animation.shots),
    ...cuesLaid(state.animation),
    ...someOrNone('tracks', state.animation.tracks.map(trackSummary)),
    nodes: mostWanted(state.nodes, state.selectedIds).map(nodeSummary),
    world: apartFrom(state.world, DEFAULT_WORLD),
  }
}

export function readState(): ActionOutcome {
  const open = mounted()
  return open
    ? { ok: true, data: stateSummary(open.documentId, open.state) }
    : refused('wrongSurface', NO_SCENE)
}
