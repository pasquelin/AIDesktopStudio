import { ACTIVITY_RETENTION } from '@shared/domain/activity'
import { emptyAssetCounts, isAssetType } from '@shared/domain/asset'
import { byCodeUnit } from '@shared/text'
import { holes } from './sqlText'
import type { SqliteDriver } from './sqlite'
import { transaction } from './sqlMigrate'
import { optionalNumber, optionalText, text } from './sqlRow'
import { activityOf, assetOf, copyGroupsOf, isUnder, withoutTrailingSlash } from './catalogRows'
import { CATALOG_DEFAULT_LIMIT, migrate } from './catalogSchema'
import type { Catalog } from './catalogTypes'
import { addAsset } from './catalogMutations'
import { assetsUnder, searchAssets } from './catalogSearch'
import { activityStatements, assetStatements, pathStatements, underPath } from './catalogStatements'

export { migrate } from './catalogSchema'
export type { BackedUpItem, Catalog, FiledAsset } from './catalogTypes'

export function createCatalog(driver: SqliteDriver): Catalog {
  migrate(driver)

  const assets = assetStatements(driver)
  const paths = pathStatements(driver)
  const activity = activityStatements(driver)
  const tagsOf = (assetId: string): string[] =>
    assets.selectTags
      .all(assetId)
      .map(row => text(row, 'tag'))
      .sort(byCodeUnit)

  /**
   * One query for the whole page rather than one per row: a 200-asset search was 201
   * synchronous queries, and a synchronous query in the main process blocks every window.
   */
  const tagsByAsset = (assetIds: readonly string[]): Map<string, string[]> => {
    const grouped = new Map<string, string[]>()
    if (assetIds.length === 0) return grouped

    const placeholders = holes(assetIds.length)
    const rows = driver
      .prepare(`SELECT asset_id, tag FROM asset_tags WHERE asset_id IN (${placeholders})`)
      .all(...assetIds)

    for (const row of rows) {
      const assetId = text(row, 'asset_id')
      const existing = grouped.get(assetId)
      if (existing) existing.push(text(row, 'tag'))
      else grouped.set(assetId, [text(row, 'tag')])
    }

    for (const tags of grouped.values()) tags.sort(byCodeUnit)
    return grouped
  }

  return {
    add: asset => addAsset(asset, assets),
    setAnimationPoster: ({ assetId, sourcePath, posterPath, replace = false }) => {
      // `local_changed_at` moves even when the path does not: a redrawn still keeps its name,
      // and the shelf reads it through a versioned URL that would otherwise serve the old one.
      const now = new Date().toISOString()
      assets.setAnimationPoster.run(posterPath, now, assetId, sourcePath, replace ? 1 : 0)
      return (optionalNumber(paths.rowsChanged.get() ?? {}, 'touched') ?? 0) > 0
    },

    find: assetId => {
      const row = assets.selectAsset.get(assetId)
      return row ? assetOf(row, tagsOf(assetId)) : null
    },

    findByRemoteId: remoteAssetId => {
      const row = assets.selectByRemoteId.get(remoteAssetId)
      if (!row) return null
      return assetOf(row, tagsOf(text(row, 'id')))
    },

    findByHash: hash => {
      const row = assets.selectByHash.get(hash)
      return row ? assetOf(row, tagsOf(text(row, 'id'))) : null
    },

    copies: hash =>
      copyGroupsOf(hash === undefined ? paths.selectCopies.all() : paths.selectCopiesOf.all(hash)),

    clearDerivedPaths: () => {
      paths.clearDerivedPaths.run()
      return optionalNumber(paths.rowsChanged.get() ?? {}, 'touched') ?? 0
    },

    remove: assetId => {
      // One statement's worth of atomicity: a crash between the two would leave children
      // pointing at a row that is gone. The tags follow on their own — `asset_tags` is
      // `ON DELETE CASCADE`, and both drivers turn foreign keys on.
      transaction(driver, () => {
        assets.orphanChildren.run(assetId)
        assets.deleteAsset.run(assetId)
      })
    },

    repath: (from, to) => {
      const source = withoutTrailingSlash(from)
      const target = withoutTrailingSlash(to)

      // An empty path names the project root, which is not something a row can be filed at.
      if (!source || !target || source === target) return

      /**
       * A folder cannot be moved INTO itself, and the refusal belongs here rather than only in
       * the caller that already forbids the gesture.
       *
       * Without it this operation stops being idempotent, which is the property a replayed
       * journal rests on: rewriting `Rushes` to `Rushes/2024` leaves rows that still begin with
       * `Rushes/`, so a second pass files them at `Rushes/2024/2024/…`, and every replay sinks
       * them one level deeper.
       */
      if (isUnder(target, source)) return

      transaction(driver, () => {
        paths.movePaths.run(target, source, ...underPath(source))
        paths.moveConvertedSources.run(target, source, ...underPath(source))
      })
    },

    filed: () =>
      paths.selectFiled.all().map(row => ({
        id: text(row, 'id'),
        path: text(row, 'path'),
        hash: optionalText(row, 'hash') ?? null,
        missingAt: optionalText(row, 'missing_at') ?? null,
      })),

    markMissing: (assetId, at) => {
      if (!assetId) return
      paths.setMissingAt.run(at, assetId)
    },

    backup: () => {
      const rows = paths.selectBackup.all()
      // The grouped read, for the reason a search uses it: a project of ten thousand assets would
      // otherwise be ten thousand more queries, in the thread that answers every window's.
      const tags = tagsByAsset(rows.map(row => text(row, 'id')))

      return rows.map(row => {
        const seed = optionalNumber(row, 'seed')
        const prompt = optionalText(row, 'prompt')
        const modelId = optionalText(row, 'model_id')

        return {
          hash: text(row, 'hash'),
          id: text(row, 'id'),
          name: text(row, 'name'),
          type: text(row, 'type'),
          path: text(row, 'path'),
          createdAt: text(row, 'created_at'),
          tags: tags.get(text(row, 'id')) ?? [],
          ...(prompt === undefined ? {} : { prompt }),
          ...(modelId === undefined ? {} : { modelId }),
          ...(seed === undefined ? {} : { seed }),
        }
      })
    },

    forgetUnder: path => {
      // `assets/img/` and `assets/img` name one folder to the filesystem and two strings to
      // SQLite. Left as typed, the trailing slash made this touch nothing at all — silently,
      // and after the files had already gone to the trash.
      const root = withoutTrailingSlash(path)
      if (!root) return 0

      // Nothing is orphaned and nothing is dropped: the rows are all still there, and a child
      // still points at the parent it was derived from. Only the date changes.
      return transaction(driver, () => {
        paths.missUnder.run(new Date().toISOString(), ...underPath(root))
        return optionalNumber(paths.rowsChanged.get() ?? {}, 'touched') ?? 0
      })
    },

    search: query => searchAssets(driver, tagsByAsset, query),
    assetsUnder: folders => assetsUnder(driver, tagsByAsset, folders),
    countByType: () => {
      const counts = emptyAssetCounts()

      for (const row of assets.countTypes.all()) {
        const type = text(row, 'type')
        // A kind this build no longer knows is dropped rather than counted under another.
        if (isAssetType(type)) counts[type] = optionalNumber(row, 'total') ?? 0
      }

      return counts
    },

    appendActivity: entries => {
      if (entries.length === 0) return []

      // One transaction for the whole batch: a push of two hundred assets writes two hundred
      // lines, and two hundred commits on a synchronous driver is a window that stops drawing.
      transaction(driver, () => {
        for (const entry of entries) {
          activity.insertActivity.run(
            entry.at,
            entry.level,
            entry.topic,
            entry.messageKey,
            entry.params === undefined ? null : JSON.stringify(entry.params),
            entry.detail ?? null,
            entry.assetId ?? null,
          )
        }

        // Trimmed here rather than on a timer: this is the only place the journal grows, and a
        // bound nobody enforces is a bound written in a comment.
        activity.pruneActivity.run(ACTIVITY_RETENTION)
      })

      // The ids alone, paired back onto the drafts the caller still holds: `run` answers nothing
      // through the port, and re-reading whole rows would re-parse params we just serialised.
      // Ascending, so a batch longer than the retention keeps its surviving tail.
      const ids = activity.selectActivityIds
        .all(entries.length)
        .map(row => optionalNumber(row, 'id') ?? 0)
      return entries.slice(-ids.length).map((entry, index) => ({ ...entry, id: ids[index] ?? 0 }))
    },

    // Narrowing by level or topic is the window's job: it holds what it was given, so a filter
    // costs it no round trip. This answers a count, newest first, and nothing else.
    readActivity: query =>
      activity.selectActivity.all(query.limit ?? CATALOG_DEFAULT_LIMIT).map(activityOf),

    close: () => driver.close(),
  }
}
