import { ASSET_ID_PREFIX, type Asset } from '@shared/domain/asset'
import type { DocumentKind } from '@shared/domain/document'
import { FOLDER_ROOT } from '@shared/domain/folder'
import { pathBaseNameOf } from '@shared/domain/fileName'

export type DocumentDependenciesDeps = {
  read: (id: string, kind: DocumentKind) => Promise<{ content: string } | null>
  /** Every filed row of the project, unbounded — `assetsUnder`, for the reason it is unbounded. */
  filedAssets: () => Promise<readonly Asset[]>
}

/**
 * Which files a document cites — `fileDependents` turned round.
 *
 * The reverse reader answers « what would this deletion break »; this answers « what has to
 * travel with this document », and both read the same two ways a citation is written.
 *
 * 🛑 The two halves are NOT equally sure, and the difference is worth keeping in mind wherever
 * this is used. An id is exact: it is spelt with a prefix nothing else wears, and the catalogue
 * either holds that row or does not. A NAME is a guess — two files of one name in two folders
 * answer for each other — so this over-reports, exactly as its reverse does.
 *
 * Over-reporting is the safe way round HERE too, and for a sharper reason than a warning: a
 * gathering that copies a file too many leaves the destination able to open the document, where
 * one that misses a file leaves it broken.
 */
export function createDocumentDependencies({ read, filedAssets }: DocumentDependenciesDeps): {
  citedBy: (documentId: string, kind: DocumentKind) => Promise<Asset[]>
} {
  return {
    citedBy: async (documentId, kind) => {
      const document = await read(documentId, kind)
      if (!document) return []

      const cited = citedIdsOf(document.content)
      const rows = await filedAssets()

      return rows.filter(row => cited.has(row.id) || namesIn(document.content, row))
    },
  }
}

/**
 * Every asset id the content spells out. Exact, and cheap: one pass rather than a membership
 * test per row of the catalogue.
 */
function citedIdsOf(content: string): ReadonlySet<string> {
  const found = new Set<string>()
  const ids = new RegExp(`${ASSET_ID_PREFIX}[A-Za-z0-9_-]+`, 'g')
  for (const match of content.matchAll(ids)) found.add(match[0])
  return found
}

/** The other half a citation may be written as — the file's own name, raw or as a URI writes it. */
function namesIn(content: string, row: Asset): boolean {
  if (!row.path) return false
  const name = pathBaseNameOf(row.path)
  if (name === '') return false
  return content.includes(name) || content.includes(encodeURIComponent(name))
}

/** The whole project, which is what « every filed row » is asked for as. */
export const EVERY_FOLDER: readonly string[] = [FOLDER_ROOT]
