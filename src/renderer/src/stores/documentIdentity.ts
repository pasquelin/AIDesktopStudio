import type { Asset } from '@shared/domain/asset'
import type { DocumentDescriptor, DocumentKind } from '@shared/domain/document'

/**
 * What answering « which document is this? » needs: the tabs, and the project's own listing.
 *
 * Declared here rather than taken from the store, and it is what keeps the import one-way: the
 * store reads this module for `reunitedDocument`, so a type borrowed back would close a cycle.
 */
type DocumentsHeld = {
  documents: Record<string, DocumentDescriptor>
  stored: readonly DocumentDescriptor[]
}

export function documentForAsset(
  state: DocumentsHeld,
  assetId: string,
  kind?: DocumentKind,
): DocumentDescriptor | null {
  const isIt = (document: DocumentDescriptor): boolean =>
    document.sourceAssetId === assetId && (kind === undefined || document.kind === kind)
  return Object.values(state.documents).find(isIt) ?? state.stored.find(isIt) ?? null
}

/**
 * The document this FILE already is, whichever door asks — §2.6, one identity per file.
 *
 * Three ways to the same answer, and they are tried in that order because they age differently:
 * the asset id is exact while the catalogue keeps it, the source PATH outlives a catalogue
 * rebuilt from the folder, and the listing answers for a file that IS a document — a `.ora`
 * painted elsewhere, or one this studio wrote.
 *
 * Without it a double-click on the row of a layered picture stood a SECOND document on the file
 * the tab was already holding, each free to save over the other (U-1, E-12).
 */
export function documentForFile(
  state: DocumentsHeld,
  asset: Pick<Asset, 'id' | 'path'>,
  kind?: DocumentKind,
): DocumentDescriptor | null {
  const found = documentForAsset(state, asset.id, kind)
  if (found || !asset.path) return found

  const path = asset.path
  const isIt = (document: DocumentDescriptor): boolean =>
    (document.sourcePath === path || document.path === path) &&
    (kind === undefined || document.kind === kind)
  return Object.values(state.documents).find(isIt) ?? state.stored.find(isIt) ?? null
}

/**
 * The listing's answer for a document a tab already holds, keeping the session's own links.
 *
 * The folder answers what the FILE says, and four fields are in no file: which asset the tab
 * edits, where that asset sits, how faithfully it was read, and the destination it was opened on.
 * Overwritten wholesale, a relist turned a picture's tab into a document with no destination —
 * and the next ⌘S wrote an `.ora` beside the picture rather than into it.
 *
 * 🛑 It rests on `descriptorFrom` never spelling an absent field as `undefined`: it spreads them
 * conditionally, so a key the file has nothing for is truly absent and does not overwrite here.
 */
export function reunitedDocument(
  held: DocumentDescriptor | undefined,
  listed: DocumentDescriptor,
): DocumentDescriptor {
  return held ? { ...held, ...listed } : listed
}
