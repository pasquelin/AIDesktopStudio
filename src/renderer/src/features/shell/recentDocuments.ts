import { orElse } from '@shared/promises'
import type { DocumentDescriptor } from '@shared/domain/document'
import { getBridge } from '@/services/bridge'

/**
 * Tells the main process a document was put in front, for File ▸ Open recent. From `openDocument`
 * alone: every deliberate opening goes through it, a layout restore does not.
 *
 * 🛑 The document and NOT the project holding it — paired here, one opened right after a switch
 * lands under the project just left, and `dockviewApi` would reach `stores/project` and cycle.
 */
export async function noteOpenedDocument(document: DocumentDescriptor): Promise<void> {
  // Swallowed on purpose: the main process journals a settings write that failed, and a list of
  // shortcuts that missed one opening has nothing to say to the person who just opened it.
  await orElse(getBridge()?.documents.opened(document.path, document.kind), undefined)
}
