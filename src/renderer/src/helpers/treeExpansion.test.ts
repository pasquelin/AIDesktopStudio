import { describe, expect, it } from 'vitest'
import { foldTreeBranch } from './treeExpansion'

const nodes = [
  { id: 'parent', parentId: null },
  { id: 'child', parentId: 'parent' },
  { id: 'leaf', parentId: 'child' },
  { id: 'beside', parentId: null },
]

describe('foldTreeBranch', () => {
  it('closes the parent and every open descendant, but no neighbouring branch', () => {
    expect(foldTreeBranch(nodes, new Set(['parent', 'child', 'leaf', 'beside']), 'parent')).toEqual(
      new Set(['beside']),
    )
  })
})
