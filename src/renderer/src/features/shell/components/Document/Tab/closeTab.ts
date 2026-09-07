import { closeDocument } from '../../../documentIo'
import { closeFileView, panelIsFileView } from '../../dockviewApi'
import { reportFailure } from '@/services/diagnostics'

// A file view is not a document: `closeDocument` finds no io for it, so it asks nothing, drops
// the edits, and answers `true`. The four closing gestures come here so none can forget it.
export function closeTabAsking(tabId: string): Promise<boolean> {
  return panelIsFileView(tabId) ? closeFileView(tabId) : closeDocument(tabId)
}

/**
 * For a gesture with no surface of its own to fail on — the tab's cross, a row of its menu.
 * Both fail the same way: into the journal, where a ⌘S that will not write already reports.
 */
export function closeTab(tabId: string): void {
  void closeTabAsking(tabId).catch(error => reportFailure('document.close', tabId, error))
}
