import { orElse } from '@shared/promises'
import type { DocumentDescriptor } from '@shared/domain/document'
import { documentPathFor } from '@shared/domain/documentName'
import { SCRIPT_STARTER } from '@shared/domain/game'
import type { DocumentTemplateId } from '@shared/domain/newDocument'
import { getBridge } from '@/services/bridge'
import { documentAtPath, useDocuments } from '@/stores/documents'
import { openDocument } from './components/dockviewApi'

/**
 * What a caller who has nobody to ask already knows. `template` is read for the two kinds that
 * open on one and ignored elsewhere — the assistant names one, and a caller that says nothing
 * takes the default. Narrowed by the kind at the seeding, never trusted on its face: the two
 * families share a field, and `empty` is the only id both of them spell.
 *
 * Here rather than beside the window that fills it: three modules share it now, and a type both
 * halves of a split re-import from the other is exactly how an import cycle appears.
 */
export type NamedCreation = { title: string; folder?: string; template?: DocumentTemplateId }

/**
 * The file first, then the tab: `relist` is what gives the document the id its path spells.
 *
 * Apart from every other kind because a script's file IS its identity — nothing in a `.ts` can
 * carry a document id, so a tab opened under a fresh uuid would never find its file again. Three
 * things make one: the New window, a generation bringing its own source where a person's gesture
 * brings the starter, and a Save as… writing the text somewhere else.
 */
export async function createScript(
  of: NamedCreation | undefined,
  source: string = SCRIPT_STARTER,
): Promise<DocumentDescriptor | null> {
  if (!of) return null

  // Composed like every other kind: from the RAW title, a separator named a file in another
  // folder, and a name the main process refuses made `writeScript` answer `false` — nothing on
  // screen, no word.
  const path = documentPathFor(of.title, 'script', of.folder)
  // Refused rather than overwritten: this path names a file somebody already has work in.
  if (documentAtPath(useDocuments.getState(), path)) return null
  if (!(await orElse(getBridge()?.game.writeScript(path, source), false))) return null

  await useDocuments.getState().relist()
  const created = documentAtPath(useDocuments.getState(), path)
  if (created) openDocument(created)
  return created
}
