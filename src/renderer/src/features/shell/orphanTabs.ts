import { panelIds, useDocuments } from '@/stores/documents'
import { useLayouts } from '@/stores/layouts'
import { closePanel, panelIsFileView } from './components/dockviewApi'

/**
 * Closes the tabs of documents nothing can open any more — the other half of `refresh`, which
 * settles what lives from the folder and the layout and never corrects the layout back. A
 * document created and never saved is in no folder to be read, so its panel is restored alone
 * and says it is not open.
 *
 * Absent from the folder is NOT the condition: a document created during the session is absent
 * from it too, and sweeping on that alone would close a tab under the hands that opened it.
 * The store is read here rather than passed in — a row adopted while the listing travelled
 * belongs to the answer. Called only on a folder that answered, per `refresh`.
 */
export function closeOrphanTabs(): void {
  const { documents, stored } = useDocuments.getState()
  const known = new Set(stored.map(document => document.id))
  // A file view is in no listing to be missing from: swept as an orphan, its tab went without
  // the question `closeFileView` asks, and its edits with it.
  const orphans = new Set(
    [...panelIds(useLayouts.getState().layout)].filter(
      id => !documents[id] && !known.has(id) && !panelIsFileView(id),
    ),
  )
  if (orphans.size === 0) return

  // The stored layout first, for a centre the home is covering — its panels are nowhere else.
  // Closing then takes the tabs off the mounted one, and the layout it writes back on that
  // change is already free of them.
  useLayouts.getState().prune(orphans)
  for (const id of orphans) closePanel(id)
}
