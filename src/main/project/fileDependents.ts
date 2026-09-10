import { orElse } from '@shared/promises'
import { pathBaseNameOf } from '@shared/domain/fileName'
import { FOLDER_ROOT, parentOf } from '@shared/domain/folder'
import type { DocumentDescriptor, DocumentFile } from '@shared/domain/document'
import type { FileUse } from '@shared/domain/fileUse'

export type FileDependentsDeps = {
  list: () => Promise<DocumentDescriptor[]>
  read: (id: string, kind: DocumentDescriptor['kind']) => Promise<DocumentFile | null>
  /**
   * The catalogue ids of these files, when they have any — a document may cite either.
   *
   * The whole selection at once: asked per path it was one round trip each, and each answer
   * carried every row of the folder to keep at most one of them.
   */
  idsOf: (paths: readonly string[]) => Promise<ReadonlyMap<string, readonly string[]>>
}

/**
 * Which documents cite a file — the question §11's S3 says nothing could answer, and the one a
 * deletion has to ask before it takes anything away (E-21).
 *
 * Read on DEMAND rather than kept as a graph, and that is the whole of the decision here: a graph
 * costs a full parse of every document at every opening, and this question is asked by one rare,
 * deliberate gesture. What it buys is the warning; what it does not buy is a cheap answer for a
 * cleanup pass sweeping thousands of files, which is the day the graph earns its cost.
 *
 * 🛑 Its blind spot, in plain text: a citation is matched on the file's NAME and on its catalogue
 * ids, so two files of the same name in two folders answer for each other. It over-reports and
 * never under-reports, which is the safe way round for a warning — and it is why the wording says
 * these documents mention the file rather than that they need it.
 */
export function createFileDependents({ list, read, idsOf }: FileDependentsDeps): {
  usedBy: (paths: readonly string[]) => Promise<FileUse[]>
} {
  return {
    usedBy: async paths => {
      if (paths.length === 0) return []
      const ids = await idsOf(paths)
      const wanted = paths.map(path => ({
        path,
        // Encoded as well as raw: a scene writes its links as URIs, so a space is `%20`.
        needles: [pathBaseNameOf(path), encodeURIComponent(pathBaseNameOf(path))].concat(
          ids.get(path) ?? [],
        ),
      }))
      const found: FileUse[] = []
      // One at a time, and never an image: a container of ten 4K layers comes back as a hundred
      // megabytes of surfaces, and `Promise.all` over the project would hold every one of them at
      // once. An image CITES nothing anyway — it incorporates what it holds.
      for (const document of await list()) {
        if (document.kind === 'image') continue
        const file = await orElse(read(document.id, document.kind), null)
        if (!file) continue
        const used = wanted
          .filter(one => one.needles.some(needle => needle !== '' && file.content.includes(needle)))
          .map(one => one.path)
        if (used.length > 0) {
          found.push({ title: document.title, path: document.path, kind: document.kind, used })
        }
      }
      return found
    },
  }
}

/**
 * The same reader, wired to the open project: its documents, and the catalogue ids of a file.
 *
 * Here rather than at the call site so `handlers.ts` reads as a list of routes — and so the two
 * halves a citation may be written as stay named in one place.
 */
export function projectFileDependents(deps: {
  documents: Pick<FileDependentsDeps, 'list' | 'read'>
  assetsUnder: (folders: readonly string[]) => Promise<readonly { id: string; path?: string }[]>
}): ReturnType<typeof createFileDependents> {
  return createFileDependents({
    list: () => deps.documents.list(),
    read: (id, kind) => deps.documents.read(id, kind),
    idsOf: async paths => {
      const folders = [...new Set(paths.map(path => parentOf(path) ?? FOLDER_ROOT))]
      const held = await deps.assetsUnder(folders)
      const byPath = new Map<string, string[]>()
      for (const asset of held) {
        if (asset.path) byPath.set(asset.path, [...(byPath.get(asset.path) ?? []), asset.id])
      }
      return byPath
    },
  })
}
