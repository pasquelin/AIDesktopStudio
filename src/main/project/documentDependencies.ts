import type { Asset } from '@shared/domain/asset'
import type { DocumentKind } from '@shared/domain/document'
import { citationNeedlesOf, citedIdsOf, contentCites } from './citation'
import type { FiledAsset } from './catalogTypes'

export type DocumentDependenciesDeps = {
  read: (id: string, kind: DocumentKind) => Promise<{ content: string } | null>
  /**
   * Every row that names a file, four columns each.
   *
   * 🛑 `filed`, never `assetsUnder([FOLDER_ROOT])`: « under » is a range scan and the root's
   * range is EMPTY — measured, and it made this whole reader answer nothing. Cheap as well as
   * right: the rows that matter are hydrated afterwards, so a hundred thousand generation
   * parameters are never parsed to decide that a document mentions none of them.
   */
  filed: () => Promise<readonly FiledAsset[]>
  /** The full rows behind the ids that matched — only those, and batched by the caller. */
  rowsOf: (ids: readonly string[]) => Promise<Asset[]>
}

/**
 * Which files a document cites — `fileDependents` turned round, over the same two spellings a
 * citation may wear (`citation.ts`, which owns that fact and its blind spot).
 */
export function createDocumentDependencies(deps: DocumentDependenciesDeps): {
  citedBy: (documentId: string, kind: DocumentKind) => Promise<Asset[]>
} {
  return {
    citedBy: async (documentId, kind) => {
      const document = await deps.read(documentId, kind)
      if (!document) return []

      const ids = citedIdsOf(document.content)
      const rows = await deps.filed()
      const wanted = rows.filter(
        row => ids.has(row.id) || contentCites(document.content, citationNeedlesOf(row.path)),
      )

      return wanted.length === 0 ? [] : await deps.rowsOf(wanted.map(row => row.id))
    },
  }
}
