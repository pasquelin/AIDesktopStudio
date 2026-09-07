import { useEffect, useMemo, useState } from 'react'
import type { Asset } from '@shared/domain/asset'
import { documentsByPath } from '@shared/domain/document'
import type { FolderEntry } from '@shared/domain/folder'
import { assetsAt } from '@/helpers/assetAt'
import { itemOfPath, type ProjectItem } from '@/helpers/projectItem'
import { getBridge } from '@/services/bridge'
import { useDocuments } from '@/stores/documents'
import { useProject } from '@/stores/project'
import { useReloadKey } from './useReloadKey'

export type ProjectItems = {
  items: readonly ProjectItem[]
  /** Whether the folder has been walked — what tells an empty project from one still reading. */
  loaded: boolean
  /** Reads the folder again, which is what a batch of file gestures asks for. */
  reload: () => void
}

/**
 * Everything the project folder holds, as items — the domain view's source.
 *
 * The tree cannot be that source: it loads one folder at a time, so it knows only what has been
 * unfolded. This walks the whole folder once, then asks the catalogue about ALL of it in a
 * single round trip — the question `AssetQuery.paths` exists for. Four hundred files used to be
 * four hundred queries against the project's own database.
 *
 * What the catalogue answers is what makes an item's domain more than a guess at its extension.
 */
export function useProjectItems(hidden: boolean, active: boolean): ProjectItems {
  const projectPath = useProject(state => state.project?.path ?? null)
  const stored = useDocuments(state => state.stored)
  const [walked, setWalked] = useState<{ entries: readonly FolderEntry[]; loaded: boolean }>({
    entries: [],
    loaded: false,
  })
  const [assets, setAssets] = useState<Map<string, Asset>>(new Map())
  const [again, reload] = useReloadKey()

  // Emptied during the render that changes project, not after it: every path names the folder
  // just left, and a list kept a frame longer is a list whose rows open nothing.
  const [source, setSource] = useState(projectPath)
  if (source !== projectPath) {
    setSource(projectPath)
    setWalked({ entries: [], loaded: false })
    setAssets(new Map())
  }

  useEffect(() => {
    // Walked only while the domain view is the one on screen: the panel holds every source at
    // once so leaving one restores the others untouched, and a reading nobody is looking at must
    // not walk the whole project folder for it.
    if (!projectPath || !active) return

    let live = true
    void getBridge()
      ?.project.walkFolder(hidden)
      .then(async entries => {
        if (!live) return
        setWalked({ entries, loaded: true })
        // After the walk rather than beside it: the paths ARE the question, and asking before
        // they are known would be a query per file all over again.
        const found = await assetsAt(entries.map(entry => entry.path))
        if (live) setAssets(found)
      })

    return () => {
      live = false
    }
  }, [projectPath, hidden, active, again])

  const documentsByFile = useMemo(() => documentsByPath(stored), [stored])

  const items = useMemo(
    () =>
      walked.entries.map(entry =>
        itemOfPath(entry.path, {
          asset: assets.get(entry.path),
          document: documentsByFile.get(entry.path),
        }),
      ),
    [walked.entries, assets, documentsByFile],
  )

  return { items, loaded: walked.loaded, reload }
}
