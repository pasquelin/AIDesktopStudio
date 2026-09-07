import { readFile, rm } from 'node:fs/promises'
import { basename, join } from 'node:path'
import {
  DOCUMENT_VERSION,
  LEGACY_DOCUMENTS_FOLDER,
  documentExtensionOf,
  kindsForExtension,
  roleForKind,
  workspaceForKind,
  type DocumentDescriptor,
  type DocumentEnvelope,
  type DocumentFile,
  type DocumentKind,
} from '@shared/domain/document'
import { documentFileName, nextFreeDocumentName } from '@shared/domain/documentName'
import { parentOf, pathIn } from '@shared/domain/folder'
import { exists, isMissing } from '@main/persistence'
import { bodyFormatOf } from './documentBody'
import {
  claimsDocument,
  isStagingCopy,
  pooledHeads,
  type DocumentFiles,
  type DocumentFilesDeps,
  type FoundDocument,
} from './documentFilesShared'
import { renameDocument, type RenameDeps } from './documentRename'
import { DocumentFilesContext } from './documentFilesContext'

/**
 * Documents as files in the project folder — a document is the user's own work, and it has to
 * survive a catalogue rebuilt from that folder.
 */
export function createDocumentFiles({
  projectPath,
  now,
  walkFiles,
  folderNames,
  folderFor,
}: DocumentFilesDeps): DocumentFiles {
  const context = new DocumentFilesContext({ projectPath, now, walkFiles, folderNames, folderFor })

  /** Keeps the body and read time so open and rename do not parse an unheaded montage twice. */
  const foundAt = async (path: string): Promise<FoundDocument | null> => {
    const entry = basename(path)
    const extension = documentExtensionOf(entry)
    const claimed = kindsForExtension(extension)
    // Extensionless files are probed so a document that lost its extension remains recoverable.
    if (claimed.length === 0 && extension !== '') return null

    try {
      const file = context.absoluteOf(path)
      const { envelope, body, time } = await context.heads.read(file)
      const descriptor = descriptorFrom(path, entry, extension, claimed, envelope)
      return descriptor ? { descriptor, body, time } : null
    } catch {
      // One unreadable document must not cost the user the listing of all the others.
      return null
    }
  }

  const descriptorOf = async (path: string): Promise<DocumentDescriptor | null> =>
    (await foundAt(path))?.descriptor ?? null

  /** Walks once; duplicate ids are deterministically disambiguated by sorted path. */
  const walk = async (): Promise<DocumentDescriptor[]> => {
    // One pass over the walk, not three. A project of a hundred thousand files is a hundred
    // thousand strings, and this runs on the thread that owns every window — mapping them to
    // paths, then filtering for context.staging copies, then filtering again for documents was three
    // uninterrupted blocks where one loop answers both questions.
    const candidates: string[] = []
    const orphans: string[] = []

    for (const { path } of await walkFiles()) {
      if (claimsDocument(path)) candidates.push(path)
      else if (isStagingCopy(path, context.staging)) orphans.push(path)
    }

    /**
     * A folder document stages a FOLDER — `Planche.img.<uuid>.tmp` — and the walk answers files
     * and documents, so it never shows one. Its own folder is read for it: the folders documents
     * were found in, which is where the writer puts them and the only place one can be.
     *
     * Read once the candidates are known, so it costs one `readdir` per folder actually holding
     * a document — one or two in an ordinary project — rather than a second walk.
     */
    const folders = new Set(candidates.map(path => parentOf(path) ?? ''))
    folders.add(LEGACY_DOCUMENTS_FOLDER)

    const staged = await Promise.all(
      [...folders].map(async folder => {
        const names = (await folderNames(folder)) ?? []
        return names
          .map(name => pathIn(folder, name))
          .filter(path => isStagingCopy(path, context.staging))
      }),
    )

    await context.sweep([...orphans, ...staged.flat()])

    context.index.clear()

    // By code unit, and said so: this ordering reaches no reader — it only settles WHICH of two
    // files claiming one id keeps it, and that answer has to be the same on every machine.
    candidates.sort((one, other) => (one < other ? -1 : one > other ? 1 : 0))

    const found: DocumentDescriptor[] = []
    for (const descriptor of await pooledHeads(candidates, descriptorOf)) {
      if (!descriptor) continue

      const claimed = context.index.has(context.keyOf(descriptor.id, descriptor.kind))
      const id = claimed ? descriptor.path : descriptor.id
      context.index.set(context.keyOf(id, descriptor.kind), descriptor.path)
      found.push(claimed ? { ...descriptor, id } : descriptor)
    }
    return found
  }

  /** Verifies cached paths and carries the read result forward to avoid a second parse. */
  const locate = async (
    id: string,
    kind: DocumentKind,
  ): Promise<{ file: string; found: FoundDocument | null }> => {
    /**
     * Whether the file at this path IS the document being asked for.
     *
     * `path === id` is the second document of a duplicated pair: `walk` gives it its own path
     * for an id, its envelope still answering the id it was copied from — so an equality on the
     * envelope alone rejected it, and every gesture fell through to the address it WOULD have
     * had. Listed, and unopenable: a double-click gave an empty tab and the next ⌘S wrote that
     * emptiness under `documents/<the whole path>.gltf`.
     *
     * No id can collide with a path: one is a uuid or the stem of a pre-version-3 file, and a
     * path carries the extension the stem drops.
     */
    const holding = async (path: string): Promise<FoundDocument | null> => {
      const found = await foundAt(path)
      if (!found || found.descriptor.kind !== kind) return null
      return found.descriptor.id === id || path === id ? found : null
    }

    const cached = context.index.get(context.keyOf(id, kind))
    if (cached) {
      const found = await holding(cached)
      if (found) return { file: context.absoluteOf(cached), found }
    }

    // A folder that cannot be read answers "not found" rather than throwing: whatever is wrong
    // with it, the caller is about to touch it and will fail with its OWN error, which is the
    // one worth reporting — a `documents` that is a file must say `mkdir`, not `scandir`.
    try {
      await walk()
    } catch {
      return { file: context.fileOf(id, kind), found: null }
    }

    const listed = context.index.get(context.keyOf(id, kind))
    if (listed) {
      const found = await holding(listed)
      if (found) return { file: context.absoluteOf(listed), found }
    }

    // Never listed, so never written: a document saved for the first time is named after itself
    // by `write`, and this is only what `read` and `remove` ask about before that happens.
    return { file: context.fileOf(id, kind), found: null }
  }

  /** A first save uses the chosen folder and suffixes studio-generated duplicate names. */
  const freshFile = async (kind: DocumentKind, title: string, named?: string): Promise<string> => {
    const folder = named ?? (await folderFor(roleForKind(kind)))
    const taken = await context.namesIn(folder)
    return join(
      context.absoluteOf(folder),
      documentFileName(nextFreeDocumentName(title, kind, taken), kind),
    )
  }

  /** The bytes under a file, put back into a document — or nothing, for a file that is not there. */
  const bodyAt = async (
    file: string,
    kind: DocumentKind,
    id: string,
  ): Promise<DocumentFile | null> => {
    let document: DocumentFile
    try {
      document = bodyFormatOf(documentExtensionOf(basename(file))).read(await readFile(file))
    } catch (error) {
      if (isMissing(error)) return null
      throw error
    }

    // The file must still be what the caller was listed: a document copied to another extension
    // by hand would otherwise open in the wrong editor, with the wrong content.
    if (document.kind !== kind) {
      throw new Error(`Document ${id} holds a ${document.kind}, not a ${kind}`)
    }
    return document
  }

  async function readOne(id: string, kind: DocumentKind): Promise<DocumentFile | null> {
    const { file, found } = await locate(id, kind)

    // BEFORE the read, never after. A file rewritten while it is being read would otherwise be
    // remembered by the time of a write whose bytes never reached this state — and the next ⌘S
    // would find the times agreeing and overwrite it. Taken first, the error leans the safe way:
    // the studio believes the file older than it is, and asks.
    //
    // `found.time` was taken before its own head read, so it is that same instant or earlier.
    if (found) context.seen.set(file, found.time)
    else await context.remember(file)

    return found?.body ?? (await bodyAt(file, kind, id))
  }

  const renameDeps: RenameDeps = {
    locate,
    relativeOf: context.relativeOf,
    namesIn: context.namesIn,
    absoluteOf: context.absoluteOf,
    bodyAt,
    store: context.store,
    heads: context.heads,
    index: context.index,
    keyOf: context.keyOf,
    remember: context.remember,
    seen: context.seen,
  }

  return {
    list: walk,

    read: (id, kind) => context.queued(id, () => readOne(id, kind)),

    write: (id, kind, draft, force = false, folder) =>
      context.queued(id, async () => {
        // A document already on disk keeps the file it is in — including one written before
        // version 3, still under the uuid it was named after. Renaming those is the user's
        // gesture, not something a save does behind them. `folder` is read here and nowhere
        // else, which is what makes a chosen folder a placement rather than a move.
        const { file: located } = await locate(id, kind)
        const onDisk = await exists(located)
        const file = onDisk ? located : await freshFile(kind, draft.title, folder)

        // A document the studio has no clock for is one it cannot claim to have written, so it
        // is not defended — and nothing is stat'd for it either.
        const known = onDisk && !force ? context.seen.get(file) : undefined
        if (known !== undefined && (await context.timeOf(file)) !== known) return 'stale'

        // Stamped here rather than taken from the draft: the renderer owns none of these, and
        // an id from its side would be its word against the folder's.
        const document = { ...draft, version: DOCUMENT_VERSION, kind, updatedAt: now(), id }

        await context.store(file, document)
        // The head kept for this file is now a description of bytes that are gone. Dropped
        // rather than left to the clock: a save landing in the same millisecond at the same
        // size is the one case `mtimeMs` cannot tell apart, and it is the studio's own writes
        // that come that fast.
        context.heads.forget(file)
        context.index.set(context.keyOf(id, kind), context.relativeOf(file))
        await context.remember(file)
        return 'written'
      }),

    rename: (id, kind, title) =>
      context.queued(id, () => renameDocument(renameDeps, id, kind, title)),

    // `force`: closing a document that was never saved must not fail on a file that is absent.
    remove: async (id, kind) => {
      await context.queued(id, async () => {
        const { file, found } = await locate(id, kind)
        // Refused only for a file that demonstrably belongs to something ELSE. `locate` falls
        // back on the address a document WOULD have had, and two kinds share an extension — so
        // that address is the same for both, and an id that happens to be another document's
        // file name would have that document removed instead.
        //
        // One that answers nothing is still removed, which is what a file that is not there has
        // always been. **The blind spot is `locate`, not this**: a document whose envelope
        // stopped reading cannot be found at all, so removal lands on the address it would have
        // had and the real file stays — invisible in every list and undeletable from the studio.
        //
        // A `found` needs no second opinion: `locate` has already established that this file IS
        // the document asked for. Asking its DESCRIPTOR again would refuse a duplicated document
        // — its envelope answers the id it was copied from, never the path it is known by.
        const sitting = found ? null : await descriptorOf(context.relativeOf(file))
        if (found || !sitting || (sitting.id === id && sitting.kind === kind)) {
          await rm(file, { force: true })
        }
        context.heads.forget(file)
        context.index.delete(context.keyOf(id, kind))
        context.seen.delete(file)
      })
    },
  }
}

function descriptorFrom(
  path: string,
  entry: string,
  extension: string,
  claimed: readonly DocumentKind[],
  envelope: DocumentEnvelope,
): DocumentDescriptor | null {
  if (claimed.length > 0 && !claimed.includes(envelope.kind)) return null
  const workspace = workspaceForKind(envelope.kind)
  if (!workspace) return null
  const stem = basename(entry, extension)
  return {
    id: envelope.id ?? stem,
    kind: envelope.kind,
    title: envelope.title || stem,
    workspace,
    path,
    ...(envelope.sourceAssetId ? { sourceAssetId: envelope.sourceAssetId } : {}),
  }
}
