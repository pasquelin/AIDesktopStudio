import { movesOnItsOwn } from '@shared/domain/component'
import type { SceneNode } from './sceneState'

export type GroupingStrategy = 'instance' | 'batch'

export function excludesGrouping(node: SceneNode, strategy: GroupingStrategy): boolean {
  const mode = node.optimization?.mode ?? 'auto'
  return (
    mode === 'exclude' ||
    mode === 'individual' ||
    (mode === 'instance' && strategy === 'batch') ||
    (mode === 'batch' && strategy === 'instance')
  )
}

export function forcesGrouping(node: SceneNode): boolean {
  return node.optimization?.mode === 'instance' || node.optimization?.mode === 'batch'
}

export function groupingExclusions(
  nodes: readonly SceneNode[],
  driven: ReadonlySet<string>,
  strategy: GroupingStrategy = 'instance',
): ReadonlySet<string> {
  return collectGroupingExclusions(nodes, driven, node => excludesGrouping(node, strategy))
}

function collectGroupingExclusions(
  nodes: readonly SceneNode[],
  driven: ReadonlySet<string>,
  excludes: (node: SceneNode) => boolean,
): ReadonlySet<string> {
  const excluded = new Set(driven)
  const children = new Map<string, string[]>()
  for (const node of nodes) {
    if (
      excludes(node) ||
      movesOnItsOwn(node.components) ||
      node.components?.some(component => component.type === 'Script')
    ) {
      excluded.add(node.id)
    }
    if (!node.parentId) continue
    const siblings = children.get(node.parentId)
    if (siblings) siblings.push(node.id)
    else children.set(node.parentId, [node.id])
  }
  const roots = [...excluded]
  for (let at = 0; at < roots.length; at += 1) {
    for (const child of children.get(roots[at] ?? '') ?? []) {
      if (excluded.has(child)) continue
      excluded.add(child)
      roots.push(child)
    }
  }
  return excluded
}

export function behavioralGroupingExclusions(
  nodes: readonly SceneNode[],
  driven: ReadonlySet<string>,
): ReadonlySet<string> {
  return collectGroupingExclusions(nodes, driven, () => false)
}
