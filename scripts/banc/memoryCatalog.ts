import type { AsyncCatalog } from '@main/project/catalogClient'
import {
  ASSET_TYPES,
  emptyAssetCounts,
  type Asset,
  type AssetCounts,
  type AssetQuery,
  type AssetType,
} from '@shared/domain/asset'
import { filingTypeOf } from '@shared/domain/filingType'
import { natureOf } from '@shared/domain/fileRole'
import { isUnder, nameOf, parentOf, type FileKind } from '@shared/domain/folder'
import { matchesWords, searchWords } from '@shared/text'
import { WHEN } from './project'

/**
 * The DATABASE, and nothing else: every rule about what a search MEANS lives in the studio, and
 * this answers rows the way `better-sqlite3` answers rows behind the real one.
 */
export type MemoryCatalog = AsyncCatalog & { rows: () => readonly Asset[] }

/**
 * What the catalogue holds for a file of the project, as an indexing pass would file it — and
 * `null` for a file that is not an asset, which is what `other` means in `natureOf`.
 */
function rowFor(path: string, at: number): Asset | null {
  const domain = natureOf(path).domain
  if (!ASSET_TYPES.some(one => one === domain)) return null

  // The bench's project keeps the default folders, so the role map is empty here.
  const type = filingTypeOf(nameOf(path), parentOf(path) ?? '', {}, domain as AssetType)
  if (!type) return null

  return {
    id: `asset-${at + 1}`,
    name: nameOf(path),
    type,
    location: 'local',
    path,
    tags: [],
    createdAt: WHEN,
  }
}

/** The words are prepared by the CALLER — folding one term per row is that work a thousand times. */
const matches = (asset: Asset, query: AssetQuery, words: readonly string[]): boolean => {
  if (words.length > 0 && !matchesWords(`${asset.path ?? ''} ${asset.name}`, words)) return false
  if (query.type !== undefined && asset.type !== query.type) return false
  if (query.types !== undefined && !query.types.includes(asset.type)) return false
  if (query.ids !== undefined && !query.ids.includes(asset.id)) return false
  if (query.paths !== undefined && !query.paths.includes(asset.path ?? '')) return false
  if (query.path !== undefined && asset.path !== query.path) return false
  if (query.generated === true && asset.jobId === undefined) return false

  return query.tags === undefined || query.tags.every(one => asset.tags.includes(one))
}

export function createMemoryCatalog(
  seed: readonly { path: string; kind: FileKind }[],
): MemoryCatalog {
  let rows: Asset[] = seed
    .filter(one => one.kind === 'file')
    .map((one, at) => rowFor(one.path, at))
    .filter((one): one is Asset => one !== null)

  const countByType = (): AssetCounts => {
    const counts = emptyAssetCounts()
    for (const one of rows) counts[one.type] += 1
    return counts
  }

  return {
    add: asset => {
      rows = [...rows.filter(one => one.id !== asset.id), asset]
      return Promise.resolve(asset)
    },
    setAnimationPoster: async ({ assetId, sourcePath, posterPath, replace }) => {
      const asset = rows.find(one => one.id === assetId)
      if (asset?.type !== 'animation' || asset.path !== sourcePath) return false
      if (asset.posterPath && !replace) return false
      rows = rows.map(one =>
        one.id === assetId ? { ...one, posterPath, localChangedAt: new Date().toISOString() } : one,
      )
      return true
    },
    find: assetId => Promise.resolve(rows.find(one => one.id === assetId) ?? null),
    findByHash: () => Promise.resolve(null),
    copies: () => Promise.resolve([]),
    clearDerivedPaths: () => Promise.resolve(0),
    findByRemoteId: remoteAssetId =>
      Promise.resolve(rows.find(one => one.remoteAssetId === remoteAssetId) ?? null),

    assetsUnder: folders =>
      Promise.resolve(
        rows.filter(one => {
          const path = one.path
          return Boolean(path) && folders.some(to => path === to || path?.startsWith(`${to}/`))
        }),
      ),

    search: query => {
      const words = searchWords(query.text ?? '')
      const found = rows.filter(one => matches(one, query, words))
      const from = query.offset ?? 0
      return Promise.resolve(
        found.slice(from, query.limit === undefined ? undefined : from + query.limit),
      )
    },

    countByType: () => Promise.resolve(countByType()),

    remove: assetId => {
      rows = rows.filter(one => one.id !== assetId)
      return Promise.resolve()
    },

    // 🛑 The PATH alone: the real one never rewrites `name`, and renaming a folder would
    // otherwise rename every asset under it. A move into itself is refused, as it is there.
    repath: (from, to) => {
      if (from === to || isUnder(to, from)) return Promise.resolve()

      rows = rows.map(one =>
        one.path === from || isUnder(one.path ?? '', from)
          ? { ...one, path: `${to}${(one.path ?? '').slice(from.length)}` }
          : one,
      )
      return Promise.resolve()
    },

    forgetUnder: path => {
      const kept = rows.filter(one => one.path !== path && !isUnder(one.path ?? '', path))
      const gone = rows.length - kept.length
      rows = kept
      return Promise.resolve(gone)
    },

    rescan: () =>
      Promise.resolve({
        added: 0,
        updated: 0,
        removed: 0,
        scanned: 0,
        moved: 0,
        missing: 0,
        returned: 0,
        complete: true,
      }),
    appendActivity: () => Promise.resolve([]),
    readActivity: () => Promise.resolve([]),
    close: () => Promise.resolve(),

    rows: () => rows,
  }
}
