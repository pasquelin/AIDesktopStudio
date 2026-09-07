import { stableKey } from '@shared/hash'
import { byCodeUnit } from '@shared/text'
import type { SceneNode } from './sceneState'

export type BakeCandidate = {
  key: string
  sourceIds: readonly string[]
  meshCount: number
}

export function bakeCandidatesOf(
  targets: readonly SceneNode[],
  world: readonly SceneNode[],
  driven: ReadonlySet<string>,
): BakeCandidate[] {
  const parents = new Set(world.flatMap(node => (node.parentId ? [node.parentId] : [])))
  const groups = new Map<string, string[]>()
  for (const node of targets) {
    // `individual` and `exclude` are what a person answered when asked how this node should be
    // drawn, and `createOptimizedGroups` already leaves both out of every group. A bake that
    // merged them anyway would make the same document read two opposite ways.
    if (!canBake(node, parents, driven)) continue
    const key = bakeKeyOf(node)
    const group = groups.get(key)
    if (group) group.push(node.id)
    else groups.set(key, [node.id])
  }
  return [...groups]
    .filter(([, sourceIds]) => sourceIds.length > 1)
    .map(([key, sourceIds]) => ({
      key,
      sourceIds: sourceIds.sort(byCodeUnit),
      meshCount: sourceIds.length,
    }))
    .sort((one, other) => byCodeUnit(one.key, other.key))
}

function canBake(
  node: SceneNode,
  parents: ReadonlySet<string>,
  driven: ReadonlySet<string>,
): node is Extract<SceneNode, { type: 'mesh' }> {
  const mode = node.optimization?.mode ?? 'auto'
  return (
    node.type === 'mesh' &&
    !node.instances &&
    !parents.has(node.id) &&
    !driven.has(node.id) &&
    mode !== 'individual' &&
    mode !== 'exclude' &&
    (node.components?.length ?? 0) === 0
  )
}

function bakeKeyOf(node: Extract<SceneNode, { type: 'mesh' }>): string {
  return stableKey([
    node.parentId,
    // The socket a node hangs from: the baked node keeps the FIRST member's, so merging across
    // two sockets would carry every other member to where the first one hangs.
    node.attach ?? null,
    node.optimization ?? null,
    node.geometry,
    node.material,
    node.visible,
    node.castShadow,
    node.receiveShadow,
    node.negative,
  ])
}
