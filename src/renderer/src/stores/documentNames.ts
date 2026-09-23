import i18next from 'i18next'
import type { DocumentDescriptor, DocumentKind } from '@shared/domain/document'
import { documentFileName, type NamedDocument } from '@shared/domain/documentName'
import { foldForFileName } from '@shared/domain/fileName'
import { nameOf, parentOf } from '@shared/domain/folder'

/**
 * Every name already spoken for — the folder's and the open tabs' alike.
 *
 * The FILE names, and every document's rather than the blank ones of one workspace: what makes a
 * name unusable is that the folder already holds it, whoever holds it. The open tabs count as
 * much as the folder, and one of them is why: a tab opened and not yet typed in writes no file,
 * so a listing alone would hand its name straight out a second time.
 *
 * The listing is handed in rather than read off the store: `create` has to read the store and
 * write to it in one synchronous run, and it holds a fresher listing than the one `stored` has.
 */

export function takenDocumentNames(
  state: {
    documents: Record<string, DocumentDescriptor>
    stored: readonly DocumentDescriptor[]
  },
  folder: string,
): NamedDocument[] {
  // One folder, never the project: two folders may each hold a `Niveau.gltf` and the disk is
  // happy with both, so a name taken elsewhere in the tree is not taken here.
  return [...state.stored, ...Object.values(state.documents)]
    .filter(document => (parentOf(document.path) ?? '') === folder)
    .map(({ id, path }) => ({ id, fileName: nameOf(path) }))
}

/**
 * The next free name for a blank document — « Scène 3 ». What the studio proposes when it makes
 * one, and what the naming dialog opens on.
 *
 * Named after its KIND rather than « Sans titre », and the folder is why: the number is free per
 * FILE name, so the six kinds each held a « Sans titre 1 » a glyph alone told apart.
 */
export function untitledDocumentName(
  taken: readonly Pick<NamedDocument, 'fileName'>[],
  kind: DocumentKind,
): string {
  const names = new Set(taken.map(document => foldForFileName(document.fileName)))
  // Composed, hence `COMPOSED_KEYS` — and read once, the word being the same at every number.
  const called = i18next.t(`documents.kinds.${kind}`)

  // Ends on the first free one, and there are only ever as many taken as the folder holds. A
  // document opened for an asset is skipped like any other: « Image 1 » is a name one may wear.
  for (let n = 1; ; n += 1) {
    const title = i18next.t('documents.untitled', { kind: called, n })
    if (!names.has(foldForFileName(documentFileName(title, kind)))) return title
  }
}
