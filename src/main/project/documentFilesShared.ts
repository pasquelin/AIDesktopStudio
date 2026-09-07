import { basename } from 'node:path'
import {
  isStagingName,
  isDocumentExtension,
  type DocumentDescriptor,
  type DocumentDraft,
  type DocumentFile,
  type DocumentKind,
  type DocumentWrite,
  documentExtensionOf,
} from '@shared/domain/document'
import type { FolderRole } from '@shared/domain/folderRole'
import type { FolderEntry } from '@shared/domain/folder'
import { bodyFormatOf, type DocumentHead } from './documentBody'

export type DocumentFiles = {
  /**
   * Every document of the open project. The folder is what says which ones exist: a registry
   * kept beside it would follow the application rather than the project, and opening another
   * one would show the previous project's tabs.
   */
  list: () => Promise<DocumentDescriptor[]>
  /** `null` when the document has never been saved — an open tab that holds nothing yet. */
  read: (id: string, kind: DocumentKind) => Promise<DocumentFile | null>
  /**
   * `force` is the caller saying the user was asked about an outside change and said yes.
   * `folder` is where a FIRST save lands; a document that already has a file ignores it.
   */
  write: (
    id: string,
    kind: DocumentKind,
    draft: DocumentDraft,
    force?: boolean,
    folder?: string,
  ) => Promise<DocumentWrite>
  remove: (id: string, kind: DocumentKind) => Promise<void>
  /**
   * Gives a document another name, which is also giving its file another name.
   *
   * Rejects rather than suffixing when the folder already holds that name: this is a name the
   * user typed, and handing them a document called something they did not write is worse than
   * saying no. `checkDocumentName` is what says the same thing before the gesture.
   */
  rename: (id: string, kind: DocumentKind, title: string) => Promise<DocumentDescriptor>
}

/**
 * What `rename` throws when the folder already holds the name.
 *
 * Not exported, and nobody imports it across the bridge: what the renderer actually reads is
 * `message.includes('duplicate')` against `DOCUMENT_NAME_FAILURES` (`stores/documents.ts`), so
 * the contract is that this message CONTAINS the shared code, not that it equals this value.
 */
export const DOCUMENT_DUPLICATE_NAME = 'duplicate-name'

/**
 * The staging copies in a folder that nobody is writing any more — the remains of a process
 * that died between the write and the rename, which the `catch` of a failed write never sees.
 *
 * `inFlight` is what keeps a save happening right now from being swept: every window writes
 * through the one main process, so that set is the whole truth about who is holding what. It
 * holds NAMES, as the writer registers them, and the paths come from a walk of the project —
 * two folders may each be staging a copy, and the question is only whether this file is one.
 *
 * Pure, and separate from the sweep itself: `readdir` and `rm` are as testable as any other
 * disk call, which is to say not, and the rule is the part worth being sure of.
 */
export function isStagingCopy(path: string, inFlight: ReadonlySet<string>): boolean {
  return isStagingName(path) && !inFlight.has(basename(path))
}

export function orphanStagingCopies(
  paths: readonly string[],
  inFlight: ReadonlySet<string>,
): string[] {
  return paths.filter(path => isStagingCopy(path, inFlight))
}

export type DocumentFilesDeps = {
  projectPath: () => string
  now: () => string
  /**
   * Every file the project folder holds, at any depth — `FolderReader.walk`, handed in rather
   * than walked again here.
   *
   * That walk already carries what a listing needs and what a second one would have to be kept
   * in step with — its depth bound and its refusals, `FolderReader.walk` being where they are
   * written. What is left for this file is which of those entries is a document, which is the
   * only part it knows about.
   */
  walkFiles: () => Promise<readonly FolderEntry[]>
  /**
   * Every name one folder holds, hidden ones included — `FolderReader.names`.
   *
   * The walk above cannot answer for a staging copy of a folder document: it is a directory with
   * no document extension, so the walk neither shows it nor descends into it. This reads the
   * folders documents were actually found in, which is the only place a staging copy can be.
   */
  folderNames: (relative: string) => Promise<readonly string[] | null>
  /**
   * Where a first save goes when its caller names none — `ProjectStore.folderFor`. Asked rather
   * than composed: only the main process reads the markers a rename leaves in place.
   */
  folderFor: (role: FolderRole) => Promise<string>
}

/**
 * Whether a path is worth opening for a document envelope — the filter that runs BEFORE any file
 * is opened, and what keeps reading a whole project down to one open per document.
 *
 * An extension the studio writes, or none at all: a document that lost its extension is still
 * one, and reading a head it does not have costs one bounded read of a file the user cannot have
 * many of. Everything else — every `.png`, `.glb`, `.wav` a project is full of — is turned away
 * on its name.
 */
export function claimsDocument(path: string): boolean {
  // `extensionOf` and not `extname`: the studio has one spelling of "what is this file's
  // extension", and it exists because three sites had quietly disagreed about `.gitignore`.
  // Over the NAME, since it reads back to the last dot and a folder may hold one.
  const extension = documentExtensionOf(basename(path))
  // A Set rather than `kindsForExtension`, which allocates: this runs once per file of the
  // project, and a hundred thousand of them is a hundred thousand arrays thrown away.
  return extension === '' || isDocumentExtension(extension)
}

/** How many heads are read at once, `documents.bench.ts` being what says whether it still pays:
 * a listing reads one head per document, and the cache under it — `headCache.ts` — is what makes
 * the SECOND listing of an unchanged folder cost nothing at all. */
const HEAD_POOL = 16

/** Runs `read` over `items` with at most `HEAD_POOL` in flight, ANSWERING IN ORDER.
 *
 * The order is not cosmetic: it is what settles which of two files claiming one id keeps it,
 * and that answer has to be the same on every machine. */
export async function pooledHeads<T>(
  items: readonly string[],
  read: (item: string) => Promise<T>,
): Promise<T[]> {
  const done = new Array<T>(items.length)
  let next = 0

  const worker = async (): Promise<void> => {
    for (let index = next++; index < items.length; index = next++) {
      const item = items[index]
      if (item !== undefined) done[index] = await read(item)
    }
  }

  await Promise.all(Array.from({ length: Math.min(HEAD_POOL, items.length) }, worker))
  return done
}

/**
 * What a listing needs of a file, read the cheapest way the format allows — a project of heavy
 * scenes would otherwise be read whole every time it is opened.
 *
 * Every format reads a BOUNDED head now, the two glTF kinds and the montage included — ×4,0 on
 * 5 000 documents of 200 Kio, measured 18/08. What still reads whole is a file written before its
 * id was stamped where the head reaches. `headCache.ts` sits over all of it, and is what makes the
 * second listing of an unchanged folder cost a `stat` and nothing else.
 *
 * Exported for the bench beside it rather than for callers — like `pooledHeads`, and for the same
 * reason: timing a copy of it would time something else.
 */
export async function headOf(file: string): Promise<DocumentHead> {
  return await bodyFormatOf(documentExtensionOf(basename(file))).readHead(file)
}

/**
 * A document as its own file answers for it, and everything reading that answer produced.
 *
 * The three fields are what a caller would otherwise go back to the disk for: `descriptor` is
 * what a listing shows, `body` is the document itself when the format's head IS the whole file,
 * and `time` is the clock taken BEFORE any of it was read — which is the one a save has to be
 * defended by.
 */
export type FoundDocument = {
  descriptor: DocumentDescriptor
  body: DocumentFile | null
  time: number
}
