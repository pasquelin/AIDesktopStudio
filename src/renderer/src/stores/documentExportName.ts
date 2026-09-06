import { workshopAssetOf } from '@shared/domain/character'
import { safeFileName } from '@shared/domain/fileName'
import type { DocumentsSlice } from './documents'

/**
 * What an export of this document is named — its own title, down to what a file system holds.
 * Cleaned on THIS side because the main process refuses rather than repairs: a title holding a
 * separator reaches a channel as a path, and comes back rejected with nothing on screen to say so.
 */
export function documentExportName(
  state: DocumentsSlice,
  documentId: string,
  fallback: string,
): string {
  // A workshop is no document: the file it exports is named after the model tab opened on it.
  const asset = workshopAssetOf(documentId)
  const document =
    asset === null
      ? state.documents[documentId]
      : Object.values(state.documents).find(
          one => one.kind === 'character' && one.sourceAssetId === asset,
        )
  return safeFileName(document?.title ?? '', fallback)
}
