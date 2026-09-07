import type { Asset, AssetQuery } from '@shared/domain/asset'
import { matchExpression } from './ftsMatch'
import { escapeLike, holes, NOT_PRIVATE } from './sqlText'
import type { SqliteDriver, SqlRow, SqlValue } from './sqlite'
import { text } from './sqlRow'
import { assetOf } from './catalogRows'
import { CATALOG_DEFAULT_LIMIT } from './catalogSchema'
import { underPath, UNDER_PATH } from './catalogStatements'

type TagsByAsset = (assetIds: readonly string[]) => Map<string, string[]>
type SearchParts = { conditions: string[]; params: SqlValue[] }

export function searchAssets(
  driver: SqliteDriver,
  tagsByAsset: TagsByAsset,
  query: AssetQuery,
): Asset[] {
  const { conditions, params } = searchParts(query)
  const where = `WHERE ${conditions.join(' AND ')}`
  params.push(query.limit ?? CATALOG_DEFAULT_LIMIT, query.offset ?? 0)
  const order = query.groupId ? 'output_index, id' : 'created_at DESC, id DESC'
  const rows = driver
    .prepare(`SELECT * FROM assets ${where} ORDER BY ${order} LIMIT ? OFFSET ?`)
    .all(...params)
  return assetsOf(rows, tagsByAsset)
}

/** The rows dressed with their tags — the one shape a query answers in, whatever asked for it. */
function assetsOf(rows: readonly SqlRow[], tagsByAsset: TagsByAsset): Asset[] {
  const tags = tagsByAsset(rows.map(row => text(row, 'id')))
  return rows.map(row => assetOf(row, tags.get(text(row, 'id')) ?? []))
}

function searchParts(query: AssetQuery): SearchParts {
  const parts: SearchParts = { conditions: ['missing_at IS NULL'], params: [] }
  // An id is a CAPABILITY: it cannot be guessed, and a caller holding one got it from a document
  // that already names it — a scene resolving the character it was born with, an export gathering
  // what its scenes cite. A path is composed by walking the disk, which is how the explorer
  // reaches what it must not show, so `path` and `paths` stay filtered.
  if (!query.hidden && !query.ids) parts.conditions.push(NOT_PRIVATE)
  scalarFilters(parts, query)
  setFilters(parts, query)
  if (query.generated) parts.conditions.push('model_id IS NOT NULL')
  if (query.text) textFilter(parts, query.text)
  if (query.tags?.length) tagFilter(parts, query.tags)
  return parts
}

function scalarFilters(parts: SearchParts, query: AssetQuery): void {
  const values: [string, string | undefined][] = [
    ['type', query.type],
    ['location', query.location],
    ['path', query.path],
    ['sync_state', query.syncStatus],
    ['group_id', query.groupId],
    ['derived_from', query.derivedFrom],
  ]
  for (const [column, value] of values) {
    if (!value) continue
    parts.conditions.push(`${column} = ?`)
    parts.params.push(value)
  }
}

function setFilters(parts: SearchParts, query: AssetQuery): void {
  const filters: [string, readonly string[] | undefined][] = [
    ['type', query.types],
    ['path', query.paths],
    ['id', query.ids],
    ['remote_asset_id', query.remoteAssetIds],
  ]
  for (const [column, values] of filters) {
    if (!values) continue
    parts.conditions.push(values.length > 0 ? `${column} IN (${holes(values.length)})` : '0')
    parts.params.push(...values)
  }
}

function textFilter(parts: SearchParts, value: string): void {
  const match = matchExpression(value)
  if (match) {
    parts.conditions.push('rowid IN (SELECT rowid FROM assets_fts WHERE assets_fts MATCH ?)')
    parts.params.push(match)
    return
  }
  parts.conditions.push("(name LIKE ? ESCAPE '\\' OR prompt LIKE ? ESCAPE '\\')")
  const pattern = `%${escapeLike(value)}%`
  parts.params.push(pattern, pattern)
}

function tagFilter(parts: SearchParts, tags: readonly string[]): void {
  parts.conditions.push(`id IN (
    SELECT asset_id FROM asset_tags WHERE tag IN (${holes(tags.length)})
    GROUP BY asset_id HAVING COUNT(DISTINCT tag) = ?
  )`)
  parts.params.push(...tags, tags.length)
}

/**
 * 🛑 SQLite parses an OR chain as a tree and refuses one past a depth of 1000 — measured here at
 * 997 terms. The caller passes one destination per MOVED FILE, so a large multi-selection reaches
 * it, and the throw lands where nothing reads it.
 */
const UNDER_BATCH = 200

/**
 * Every filed row under any of these folders, with NO bound.
 *
 * 🛑 Apart from `searchAssets` precisely because it must not be paged: its caller refiles what a
 * move landed, and the search's 500-row cap left the rows past it carrying the type of the folder
 * they came FROM — silently, on exactly the projects large enough to notice.
 */
export function assetsUnder(
  driver: SqliteDriver,
  tagsByAsset: TagsByAsset,
  folders: readonly string[],
): Asset[] {
  const rows = new Map<string, SqlRow>()
  for (let from = 0; from < folders.length; from += UNDER_BATCH) {
    const batch = folders.slice(from, from + UNDER_BATCH)
    const where = batch.map(() => `(${UNDER_PATH})`).join(' OR ')
    const found = driver
      .prepare(`SELECT * FROM assets WHERE missing_at IS NULL AND ${NOT_PRIVATE} AND (${where})`)
      .all(...batch.flatMap(folder => underPath(folder)))
    for (const row of found) rows.set(text(row, 'id'), row)
  }
  return assetsOf([...rows.values()], tagsByAsset)
}
