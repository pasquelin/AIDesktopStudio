import { create } from 'zustand'

export type TreeFoldPanel = 'explorer' | 'scene'

type FoldOrder = { stamp: number; wanted: boolean; anyExpanded: boolean }
type TreeFoldsState = Record<TreeFoldPanel, FoldOrder> & {
  note: (panel: TreeFoldPanel, anyExpanded: boolean) => void
  ask: (panel: TreeFoldPanel) => void
}

const CLOSED: FoldOrder = { stamp: 0, wanted: true, anyExpanded: false }

/** Bridges a tree body with its button in the panel title row. */
export const useTreeFolds = create<TreeFoldsState>()(set => ({
  explorer: CLOSED,
  scene: CLOSED,
  note: (panel, anyExpanded) =>
    set(state =>
      state[panel].anyExpanded === anyExpanded
        ? state
        : { [panel]: { ...state[panel], anyExpanded } },
    ),
  ask: panel =>
    set(state => ({
      [panel]: {
        ...state[panel],
        stamp: state[panel].stamp + 1,
        wanted: !state[panel].anyExpanded,
      },
    })),
}))
