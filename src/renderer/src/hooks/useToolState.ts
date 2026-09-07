import { useMemo } from 'react'
import { gitHoldsFolder } from '@shared/domain/git'
import type { ToolState } from '@/helpers/toolRegistry'
import { accountsHoldLibrary, useAccounts } from '@/stores/accounts'
import { useDocuments } from '@/stores/documents'
import { useGit } from '@/stores/git'
import { useHomeVisible, useLayouts } from '@/stores/layouts'
import { useProject } from '@/stores/project'
import { useSettings } from '@/stores/settings'

/**
 * The stores `toolStateOf` reads, for a caller that wants to be told when ANY of them moves. The
 * hook below cannot read it — it needs one selector per store to re-render on its own answer —
 * so `useToolState.test.ts` holds the two to the same set rather than this list alone.
 */
type Subscribable = { subscribe: (listener: () => void) => () => void }

const SOURCES: Subscribable[] = [
  useProject,
  useGit,
  useAccounts,
  useDocuments,
  useLayouts,
  useSettings,
]

/**
 * Calls back whenever what a surface can offer may have changed. For a caller outside React —
 * the bench, a headless run — where `useToolState` cannot be used.
 */
export function subscribeToToolState(listener: () => void): () => void {
  const stops = SOURCES.map(store => store.subscribe(listener))
  return () => stops.forEach(stop => stop())
}

/**
 * What `toolStateOf` reads once, subscribed instead: a plain read would leave the icon out until
 * something else happened to re-render, and a `git init` has to redraw the rail.
 */
export function useToolState(): ToolState {
  const hasProject = useProject(state => state.project !== null)
  const hasGit = useGit(state => gitHoldsFolder(state.repository))
  const hasCloud = useAccounts(accountsHoldLibrary)
  const home = useHomeVisible()
  // Whether the centre holds ANY document, never how many: subscribed to the count, opening a
  // second tab would re-render every rail group and the shell around Dockview for nothing.
  const anyDocument = useDocuments(state => Object.keys(state.documents).length > 0)
  const documentKind = useDocuments(state =>
    state.activeId ? (state.documents[state.activeId]?.kind ?? null) : null,
  )

  return useMemo(
    () => ({ hasProject, hasGit, hasCloud, centreTaken: home || anyDocument, documentKind }),
    [hasProject, hasGit, hasCloud, home, anyDocument, documentKind],
  )
}
