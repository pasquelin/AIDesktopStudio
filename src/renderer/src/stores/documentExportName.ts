import { workshopAssetOf } from '@shared/domain/character'
import { safeFileName } from '@shared/domain/fileName'
import { documentForAsset, type DocumentsRead } from './documents'

/**
 * What an export of this document is named — its own title, down to what a file system holds.
 * Cleaned on THIS side because the main process refuses rather than repairs: a title holding a
 * separator reaches a channel as a path, and comes back rejected with nothing on screen to say so.
 *
 * A workshop is no document: its export is named after the model tab opened on it. Its own module
 * because `documents.ts` stands at the size ceiling.
 */
export function documentExportName(
  state: DocumentsRead,
  documentId: string,
  fallback: string,
): string {
  const asset = workshopAssetOf(documentId)
  const document =
    asset === null ? state.documents[documentId] : documentForAsset(state, asset, 'character')
  return safeFileName(document?.title ?? '', fallback)
}
