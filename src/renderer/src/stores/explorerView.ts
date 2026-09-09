import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  COLLECTION_PERSIST_VERSION,
  DEFAULT_COLLECTION_STATE,
  withoutSearch,
  type CollectionState,
} from '@/helpers/collectionState'

/**
 * How the project is read: by where its files SIT, or by what they ARE.
 *
 * Two readings of one folder rather than two panels: the gestures, the menu and the selection
 * are the same in both, and the second is the only way to find every picture of a project whose
 * folders the user arranged their own way.
 */
type ExplorerMode = 'folder' | 'domain'

export type ExplorerViewState = {
  /**
   * What the bar holds — and `view` says which rendering draws: `list` IS the tree, `grid` the
   * tiles. A second axis and not a third value of `mode`, so the two multiply and a domain has its
   * grid. Whoever adds a rendering adds it HERE: two places answering "which view" is the defect.
   */
  collection: CollectionState
  /** Whether the studio's own bookkeeping is drawn — `.index/`, `.project.json`. */
  hidden: boolean
  mode: ExplorerMode
  setExplorerCollection: (collection: CollectionState) => void
  toggleExplorerHidden: () => void
  setExplorerMode: (mode: ExplorerMode) => void
}

/**
 * What the Explorer is showing, as opposed to what the project folder holds.
 *
 * A store because `ExplorerActions` draws the title row, a different component from the tree its
 * answers narrow. The ground state is written out and not `LIST_ONLY`, which means "no grid at all".
 */
export const useExplorerView = create<ExplorerViewState>()(
  persist(
    set => ({
      collection: { ...DEFAULT_COLLECTION_STATE, view: 'list' },
      hidden: false,
      mode: 'folder',

      setExplorerCollection: collection => set({ collection }),
      toggleExplorerHidden: () => set(state => ({ hidden: !state.hidden })),
      setExplorerMode: mode => set({ mode }),
    }),
    {
      name: 'ai-desktop-studio:explorer-view',
      // `search` is dropped by the policy every collection follows: a studio reopening on a tree
      // narrowed by a word nobody typed reads as a project gone missing.
      partialize: ({ collection, hidden, mode }) => ({
        collection: withoutSearch(collection),
        hidden,
        mode,
      }),
      version: COLLECTION_PERSIST_VERSION,
    },
  ),
)

/** What the search box holds, trimmed. Empty means the tree reads the folders lazily, as ever. */
export function explorerSearch(state: ExplorerViewState): string {
  return state.collection.search.trim()
}
