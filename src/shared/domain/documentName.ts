import { documentFolderOf, extensionOfKind, type DocumentKind } from './document'
import { pathIn } from './folder'
import {
  foldForFileName,
  isSafeFileName,
  safeFileName,
  stemForSuffix,
  withinFileNameBytes,
} from './fileName'

/**
 * Naming a document, which since documents are named by what they are called is also naming a
 * file. The two used to be different things — a title in the envelope, a uuid on disk — and the
 * user was shown both without a word to say they were one document.
 *
 * Read by both sides: the renderer asks before crossing the boundary, which spares a round trip
 * for what it can already see, and the main process refuses what it is handed regardless — a
 * window is not what decides what gets written. A refusal reaches the user through the activity
 * journal (`helpers/rename.ts`), the field having closed by the time the disk answers.
 */

/** Long enough for a sentence of a title, short enough for every file system to hold it. */
export const DOCUMENT_NAME_MAX_LENGTH = 80

/**
 * Listed as well as typed: the failure crosses the IPC boundary as an error message, so one
 * side has to be able to walk them. `duplicate` last — it is the only one the disk can raise
 * that the field could not, so it is also the only one worth recognising in a message alone.
 */
export type DocumentNameFailure = 'empty' | 'too-long' | 'invalid' | 'duplicate'

export const DOCUMENT_NAME_FAILURES: readonly DocumentNameFailure[] = [
  'empty',
  'too-long',
  'invalid',
  'duplicate',
]

/** What a folder already holds, as the check needs to see it. */
export type NamedDocument = {
  id: string
  /** The directory entry, extension included — `Niveau.gltf`. */
  fileName: string
}

/**
 * The file a document of this name and kind lands on.
 *
 * A kind with no file of its own composes a bare name — it never reaches the disk this way: its
 * tab carries the path of the model it edits, and its ⌘S patches that container.
 */
export function documentFileName(name: string, kind: DocumentKind): string {
  return `${safeFileName(name, 'document')}${extensionOfKind(kind) ?? ''}`
}

/**
 * Where a document of this name and kind lands, in the folder its author picked or its kind's own.
 *
 * 🛑 Composition ONLY: what to do about a name the folder already holds differs per caller — the
 * window refuses it, the main process suffixes it — and one of the two spellings of this path once
 * skipped `documentFileName` altogether, which let a title carrying a separator name a file
 * elsewhere.
 */
export function documentPathFor(name: string, kind: DocumentKind, folder?: string): string {
  return pathIn(folder ?? documentFolderOf(kind), documentFileName(name, kind))
}

/**
 * Whether a name can be given to a document, and what is wrong with it otherwise.
 *
 * `selfId` exempts the document being renamed, so keeping its own name is not a duplicate.
 *
 * Duplicates are read on the FILE name rather than the title: `Niveau.gltf` and `Niveau.ora`
 * are two files and may coexist, which is what the disk says and what the space glyph already
 * tells apart on screen.
 */
export function checkDocumentName(
  name: string,
  kind: DocumentKind,
  existing: readonly NamedDocument[],
  selfId?: string,
): DocumentNameFailure | null {
  const trimmed = name.trim()

  if (trimmed.length === 0) return 'empty'
  if ([...trimmed].length > DOCUMENT_NAME_MAX_LENGTH) return 'too-long'
  // And in bytes, because ext4 counts those — before `isSafeFileName`, which would answer
  // `invalid` for a title whose only fault is its length.
  if (!withinFileNameBytes(trimmed)) return 'too-long'
  // Refused rather than quietly cleaned: a title the studio would rewrite is a second name for
  // the document, and one name is the whole point.
  if (!isSafeFileName(trimmed)) return 'invalid'

  const wanted = foldForFileName(documentFileName(trimmed, kind))
  const taken = existing.some(
    document => document.id !== selfId && foldForFileName(document.fileName) === wanted,
  )

  return taken ? 'duplicate' : null
}

/**
 * The first name of this shape nobody has taken — `Niveau`, then `Niveau 2`.
 *
 * For the names the studio engenders itself, where there is nobody to ask: a new document, one
 * opened from an asset, a copy. A name a user TYPED is refused instead, by `checkDocumentName`,
 * because suffixing it would hand them a document called something they did not write.
 */
export function nextFreeDocumentName(
  base: string,
  kind: DocumentKind,
  existing: readonly NamedDocument[],
): string {
  const taken = new Set(existing.map(document => foldForFileName(document.fileName)))
  const free = (name: string): boolean => !taken.has(foldForFileName(documentFileName(name, kind)))

  if (free(base)) return base

  const stem = stemForSuffix(base)

  // No bound: the loop ends on the first free name, and there are only ever as many taken as
  // there are documents in the folder.
  for (let n = 2; ; n += 1) {
    const candidate = `${stem} ${n}`
    if (free(candidate)) return candidate
  }
}
