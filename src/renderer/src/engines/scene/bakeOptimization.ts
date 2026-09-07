import { IDENTITY_TRANSFORM } from '@shared/domain/transform'
import { commandId, type Command } from '../core/history'
import { newId } from '@/helpers/ids'
import type { MeshNode, SceneNode, SceneState } from './sceneState'
import { bakeCandidatesOf } from './bakeCandidates'

type BakeGroup = { nodes: MeshNode[]; firstIndex: number }

export function bakeOptimization(targets: readonly SceneNode[]): Command<SceneState> {
  const targetIds = new Set(targets.map(node => node.id))
  let previous: SceneState | null = null
  let baked: SceneState | null = null

  return {
    id: commandId('optimization-bake', [...targetIds]),
    refuses: state => groupsOf(state, targetIds).length === 0,
    apply: state => {
      if (baked) return baked
      previous = state
      const groups = groupsOf(state, targetIds)
      const removed = new Set(groups.flatMap(group => group.nodes.map(node => node.id)))
      const replacements = new Map(
        groups.map(group => [group.firstIndex, bakedNodeOf(group.nodes)]),
      )
      const nodes: SceneNode[] = []
      for (let at = 0; at < state.nodes.length; at += 1) {
        const replacement = replacements.get(at)
        if (replacement) nodes.push(replacement)
        const node = state.nodes[at]
        if (node && !removed.has(node.id)) nodes.push(node)
      }
      baked = { ...state, nodes, selectedIds: [...replacements.values()].map(node => node.id) }
      return baked
    },
    revert: state => previous ?? state,
  }
}

function groupsOf(
  state: Pick<SceneState, 'nodes' | 'animation'>,
  targetIds: ReadonlySet<string>,
): BakeGroup[] {
  const animated = new Set(state.animation.tracks.map(track => track.target.nodeId))
  const targets = state.nodes.filter(node => targetIds.has(node.id))
  const byId = new Map(state.nodes.map((node, at) => [node.id, { node, at }]))
  return bakeCandidatesOf(targets, state.nodes, animated).flatMap(candidate => {
    const members: { node: MeshNode; at: number }[] = candidate.sourceIds.flatMap(id => {
      const found = byId.get(id)
      return found?.node.type === 'mesh' ? [{ node: found.node, at: found.at }] : []
    })
    const firstIndex = Math.min(...members.map(member => member.at))
    return members.length > 1 ? [{ nodes: members.map(member => member.node), firstIndex }] : []
  })
}

function bakedNodeOf(nodes: readonly MeshNode[]): MeshNode {
  const first = nodes[0]
  if (!first) throw new Error('cannot bake an empty group')
  return {
    ...first,
    id: newId(),
    transform: IDENTITY_TRANSFORM,
    optimization: { mode: 'exclude' },
    instances: nodes.map(node => ({
      sourceId: node.id,
      name: node.name,
      transform: node.transform,
    })),
  }
}
