import type { AnimationTimeline } from '@shared/domain/animation'
import type { SceneWorld } from '@shared/domain/scene'
import type { SceneNode, SceneState } from './sceneState'

export type RuntimeWorldPatch = {
  readonly changedNodes: readonly SceneNode[]
  readonly removedIds: readonly string[]
  readonly order: readonly string[] | null
  readonly world: SceneWorld | null
  readonly animation: AnimationTimeline | null
}

/** Describes one immutable authoring change without serializing the unchanged world. */
export function runtimeWorldPatch(previous: SceneState, next: SceneState): RuntimeWorldPatch {
  const changedNodes: SceneNode[] = []
  if (previous.nodes.length === next.nodes.length) {
    let sameOrder = true
    for (let index = 0; index < next.nodes.length; index += 1) {
      const before = previous.nodes[index]
      const after = next.nodes[index]
      if (!before || !after || before.id !== after.id) {
        sameOrder = false
        break
      }
      if (before !== after) changedNodes.push(after)
    }
    if (sameOrder) return patchOf(previous, next, changedNodes, [], null)
  }

  changedNodes.length = 0
  const before = new Map(previous.nodes.map(node => [node.id, node]))
  for (const node of next.nodes) if (before.get(node.id) !== node) changedNodes.push(node)
  const alive = new Set(next.nodes.map(node => node.id))
  const removedIds = previous.nodes.flatMap(node => (alive.has(node.id) ? [] : [node.id]))
  return patchOf(
    previous,
    next,
    changedNodes,
    removedIds,
    next.nodes.map(node => node.id),
  )
}

function patchOf(
  previous: SceneState,
  next: SceneState,
  changedNodes: readonly SceneNode[],
  removedIds: readonly string[],
  order: readonly string[] | null,
): RuntimeWorldPatch {
  return {
    changedNodes,
    removedIds,
    order,
    world: previous.world === next.world ? null : next.world,
    animation: previous.animation === next.animation ? null : next.animation,
  }
}

export function runtimeWorldPatchIsEmpty(patch: RuntimeWorldPatch): boolean {
  return (
    patch.changedNodes.length === 0 &&
    patch.removedIds.length === 0 &&
    patch.order === null &&
    patch.world === null &&
    patch.animation === null
  )
}

export function worldWithRuntimePatch(world: SceneState, patch: RuntimeWorldPatch): SceneState {
  const changed = new Map(patch.changedNodes.map(node => [node.id, node]))
  const removed = new Set(patch.removedIds)
  const nodes = world.nodes
    .filter(node => !removed.has(node.id))
    .map(node => changed.get(node.id) ?? node)
  const held = new Set(nodes.map(node => node.id))
  for (const node of patch.changedNodes) if (!held.has(node.id)) nodes.push(node)
  const byId = new Map(nodes.map(node => [node.id, node]))

  return {
    ...world,
    nodes: patch.order
      ? patch.order.flatMap(id => {
          const node = byId.get(id)
          return node ? [node] : []
        })
      : nodes,
    world: patch.world ?? world.world,
    animation: patch.animation ?? world.animation,
  }
}
