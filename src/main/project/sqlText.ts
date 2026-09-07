/**
 * The three pieces of SQL that get written by hand wherever a query is composed, and were spelt
 * five times between the catalogue and the memory before they were named.
 */

/** `?, ?, ?` for a list of values. Written out because SQLite binds no arrays. */
export function holes(count: number): string {
  return Array.from({ length: count }, () => '?').join(', ')
}

/** `%` and `_` are wildcards: typed by a person they must match themselves, not everything. */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, character => `\\${character}`)
}

/**
 * `isStudioPrivate` in SQL — a row whose path crosses no dot segment, which is what every listing
 * of the library is narrowed to. The studio's own resources sit under one, so nothing that
 * BROWSES ever offers them; a query naming rows outright still resolves them.
 *
 * 🛑 `path IS NULL` is not optional: a library row has no path, and without this half every
 * remote asset would drop out of the shelf.
 */
export const NOT_PRIVATE = "(path IS NULL OR (path NOT LIKE '.%' AND path NOT LIKE '%/.%'))"
