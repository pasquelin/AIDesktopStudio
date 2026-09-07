import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { refreshPalette } from '@/engines/core/palette'
import type { SelectionMode } from '@/helpers/selection'
import { flattenTree, Tree } from './Tree'

type Selector = (ids: readonly string[], mode: SelectionMode) => void

function renderTree(
  onSelect: Selector = () => {},
  onToggle = (): void => {},
  selectedIds: readonly string[] = [],
) {
  return render(
    <Tree
      nodes={NODES}
      label="Outline"
      selectedIds={selectedIds}
      expandedIds={new Set(['scene'])}
      onSelect={onSelect}
      onToggle={onToggle}
      renderRow={row => <span>{row.node.id}</span>}
    />,
  )
}

const NODES = [
  { id: 'scene', parentId: null },
  { id: 'a', parentId: 'scene' },
  { id: 'a1', parentId: 'a' },
  { id: 'b', parentId: 'scene' },
]

describe('flattenTree', () => {
  it('lists only what is reachable through expanded parents', () => {
    const rows = flattenTree(NODES, new Set(['scene']))

    expect(rows.map(row => row.node.id)).toEqual(['scene', 'a', 'b'])
  })

  it('reveals a subtree once its parent is expanded', () => {
    const rows = flattenTree(NODES, new Set(['scene', 'a']))

    expect(rows.map(row => row.node.id)).toEqual(['scene', 'a', 'a1', 'b'])
  })

  it('hides everything under a collapsed root', () => {
    expect(flattenTree(NODES, new Set()).map(row => row.node.id)).toEqual(['scene'])
  })

  it('reports depth from the root', () => {
    const rows = flattenTree(NODES, new Set(['scene', 'a']))

    expect(rows.map(row => row.depth)).toEqual([0, 1, 2, 1])
  })

  it('reports which rows have children', () => {
    const rows = flattenTree(NODES, new Set(['scene']))

    expect(rows.map(row => row.hasChildren)).toEqual([true, true, false])
  })

  it('drops a node whose parent does not exist rather than losing it silently', () => {
    expect(flattenTree([{ id: 'orphan', parentId: 'gone' }], new Set(['gone']))).toEqual([])
  })
})
describe('Tree, the height it estimates', () => {
  afterEach(() => {
    document.documentElement.style.removeProperty('--sc-control')
    document.documentElement.style.removeProperty('--sc-row-stacked')
    refreshPalette()
  })

  /**
   * The row is drawn at `h-full`, so the estimate IS the height: it is the one number, and a
   * constant would only be right at one density. Estimating 28 against a compact row of 24 does
   * not misplace anything — each row sits at the offset the virtualizer computed — it reserves
   * four pixels nobody paints: a dead band between every pair of rows, and 4×N of empty scroll
   * under the last one.
   */
  it('estimates the gauge its rows are drawn at, not a constant', () => {
    document.documentElement.style.setProperty('--sc-control', '24px')
    refreshPalette()

    renderTree()

    // Three visible rows: `scene` expanded over `a` and `b`.
    expect(screen.getByRole('tree')).toHaveStyle({ height: '72px' })
  })

  /**
   * A control's gauge, and no way to ask for another. The explorer used to ask for the stacked one
   * — a whole panel measured for a second line one row in thirty carried — and a tree is a list of
   * NAMES. `Collection` still takes the taller shapes, and its own suite holds them.
   */
  it('takes a control gauge whatever the tree, the stacked one being nobody’s to ask for', () => {
    document.documentElement.style.setProperty('--sc-control', '24px')
    document.documentElement.style.setProperty('--sc-row-stacked', '32px')
    refreshPalette()

    renderTree()

    expect(screen.getByRole('tree')).toHaveStyle({ height: '72px' })
  })

  it('falls back to the shipped height when no gauge is declared', () => {
    renderTree()

    expect(screen.getByRole('tree')).toHaveStyle({ height: '84px' })
  })

  /**
   * Switching density while the tree is on screen. Re-reading the gauge is not enough: the
   * virtualizer memoizes on `count` and friends, never on the estimator, so its cached
   * measurements survive a re-render and the rows keep the height the density just left.
   */
  it('re-measures when the density changes under a mounted tree', () => {
    document.documentElement.style.setProperty('--sc-control', '28px')
    refreshPalette()
    renderTree()
    expect(screen.getByRole('tree')).toHaveStyle({ height: '84px' })

    act(() => {
      document.documentElement.style.setProperty('--sc-control', '24px')
      refreshPalette()
    })

    expect(screen.getByRole('tree')).toHaveStyle({ height: '72px' })
  })
})
