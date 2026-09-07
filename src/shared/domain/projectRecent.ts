import type { DocumentKind } from './document'

/**
 * A document the studio has opened before, across every project — what File ▸ Open recent lists.
 *
 * Beside `RecentProject` and stored the same way, in the settings: they replicate to every window,
 * so a surface reads the list without a channel of its own.
 *
 * The pair (project, path) is the identity, and the NAME is read off the path. Nothing follows a
 * rename: an entry that no longer resolves is the ordinary case for a shelf of shortcuts — the
 * same one `useProject.open` already answers for a folder that moved — and it goes on the click
 * that fails rather than being chased across every gesture that could invalidate it.
 */
export type RecentDocument = {
  /** The project's folder, which is a project's identity. */
  project: string
  /** Relative to that folder, extension included — the spelling every path on this boundary uses. */
  path: string
  /** For the glyph, so listing does not mean reading eight files. */
  kind: DocumentKind
  /** ISO 8601, stamped when it was last opened. What decides both the order and the eviction. */
  openedAt: string
}

/**
 * How many are kept — the same bound as the projects, for the same reason: long enough to hold a
 * week of work, short enough that the list stays a shortcut rather than a file manager.
 */
export const RECENT_DOCUMENTS_MAX = 12

/**
 * The list after a document has been opened: most recently opened first, one entry per document,
 * bounded.
 *
 * Storage order IS the order this one is drawn in, unlike the projects: what a person means by
 * "recent files" is what they last had open, and every application answers it that way. A project
 * is drawn by creation instead because a shelf that reshuffles under the click is a shelf one
 * misses — a menu opened for the file at the top is not.
 */
export function withRecentDocument(
  recent: readonly RecentDocument[],
  entry: RecentDocument,
): RecentDocument[] {
  return [entry, ...withoutRecentDocument(recent, entry.project, entry.path)].slice(
    0,
    RECENT_DOCUMENTS_MAX,
  )
}

/** Drops one entry. Both halves of the identity, or one project's copy would take another's. */
export function withoutRecentDocument(
  recent: readonly RecentDocument[],
  project: string,
  path: string,
): RecentDocument[] {
  return recent.filter(one => one.project !== project || one.path !== path)
}

/**
 * Drops everything a project holds — what forgetting or binning one has to do. Its documents
 * would otherwise outlive the row that led to them, and each would reopen the project on click.
 */
export function withoutProjectDocuments(
  recent: readonly RecentDocument[],
  project: string,
): RecentDocument[] {
  return recent.filter(one => one.project !== project)
}
