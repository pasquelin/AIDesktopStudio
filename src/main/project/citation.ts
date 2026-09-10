import { ASSET_ID_PREFIX } from '@shared/domain/asset'
import { pathBaseNameOf } from '@shared/domain/fileName'

/**
 * The two ways a document names a file, spelt once for both directions of the question.
 *
 * `fileDependents` asks it file-first — which documents cite this one — and
 * `documentDependencies` asks it document-first. Written twice, the two would drift on the day
 * a third spelling arrives, and only one of them would learn about it.
 *
 * 🛑 The halves are not equally sure. An id is EXACT: it wears a prefix nothing else does, and
 * the catalogue either holds that row or does not. A NAME is a guess — two files of one name in
 * two folders answer for each other — so anything built on this over-reports. That is the safe
 * way round for both readers: a warning that names one document too many is read and dismissed,
 * and a gathering that copies one file too many still opens at the far end.
 */
export function citationNeedlesOf(path: string, ids: readonly string[] = []): string[] {
  const name = pathBaseNameOf(path)
  if (name === '') return [...ids]

  // Encoded as well as raw: a scene writes its links as URIs, so a space is `%20`.
  return [name, encodeURIComponent(name), ...ids]
}

export function contentCites(content: string, needles: readonly string[]): boolean {
  return needles.some(needle => needle !== '' && content.includes(needle))
}

/**
 * Every asset id the content spells out.
 *
 * One pass rather than a membership test per row of the catalogue — which is the half of this
 * question that CAN be answered exactly, and cheaply.
 */
export function citedIdsOf(content: string): ReadonlySet<string> {
  const ids = new RegExp(`${ASSET_ID_PREFIX}[A-Za-z0-9_-]+`, 'g')
  return new Set([...content.matchAll(ids)].map(match => match[0]))
}
