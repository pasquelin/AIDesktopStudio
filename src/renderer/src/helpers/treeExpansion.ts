export type ParentNode = { id: string; parentId: string | null }

/**
 * Closes one branch completely. Reopening its root therefore never revives folders that were
 * open below it — the project-tree behaviour shared by the Explorer and Scene outliners.
 */
export function foldTreeBranch(
  nodes: readonly ParentNode[],
  expandedIds: ReadonlySet<string>,
  rootId: string,
): ReadonlySet<string> {
  const next = new Set(expandedIds)
  next.delete(rootId)
  const parentById = new Map(nodes.map(node => [node.id, node.parentId]))

  for (const candidate of next) {
    const visited = new Set<string>()
    for (let parent = parentById.get(candidate); parent; parent = parentById.get(parent)) {
      if (parent === rootId) {
        next.delete(candidate)
        break
      }
      // Malformed input must not turn a folding gesture into an infinite walk.
      if (visited.has(parent)) break
      visited.add(parent)
    }
  }

  return next
}
