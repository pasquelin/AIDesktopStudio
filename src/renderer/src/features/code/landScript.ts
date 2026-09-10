import { orElse } from '@shared/promises'
import { documentFolderOf } from '@shared/domain/document'
import { getBridge } from '@/services/bridge'
import { createScript } from '@/features/shell/newDocument'
import { scriptRefOf, useCode } from '@/stores/code'
import { useDocuments } from '@/stores/documents'
import { takenDocumentNames, untitledDocumentName } from '@/stores/documentNames'

/**
 * Puts a generated script in the editor it was launched from, or in a tab of its own.
 *
 * `false` for the one case a person has to be told about: the editor already held changes nobody
 * saved, and `⌘Z` does not reach into it — see `CodeStoreState.wrote`.
 */
export async function landScript(documentId: string | null, source: string): Promise<boolean> {
  if (documentId !== null) {
    const script = scriptRefOf(documentId)
    return script !== null && useCode.getState().wrote(script, source)
  }

  // ASKED, never composed: only the main process reads the markers, so only it knows where the
  // code folder went after a rename — and asking is what lays it back down, marked.
  const folder = await orElse(getBridge()?.project.folderFor('code'), documentFolderOf('script'))
  const taken = takenDocumentNames(useDocuments.getState(), folder)
  const created = await createScript(
    { title: untitledDocumentName(taken, 'script'), folder },
    source,
  )
  return created !== null
}
