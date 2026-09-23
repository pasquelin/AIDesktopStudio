import { NOT_PRIVATE } from './sqlText'
import type { SqliteDriver } from './sqlite'

/** A folder and everything below it, by range rather than `LIKE` — the index answers it. */
export const UNDER_PATH = 'path = ? OR (path >= ? AND path < ?)'

export const underPath = (path: string): [string, string, string] => [path, `${path}/`, `${path}0`]

export function assetStatements(driver: SqliteDriver) {
  const insertAsset = driver.prepare(`
    INSERT OR REPLACE INTO assets
      (id, name, type, location, path, remote_asset_id, job_id, width, height, bytes,
       created_at, derived_from, source_path, hash, probe, proxy_path, peaks_path, poster_path,
       map, map_inverted, packed_slot, model_id, model_label, prompt, seed, gen_params,
       remote_owner_id, remote_updated_at, remote_synced_at, local_changed_at,
       sync_state, sync_error, group_id, output_index, model_texture_uses, model_material_ids,
       converted_from, import_losses)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  return {
    insertAsset,
    setAnimationPoster: driver.prepare(`
      UPDATE assets SET poster_path = ?, local_changed_at = ?
      WHERE id = ? AND path = ? AND type = 'animation'
        AND missing_at IS NULL AND (poster_path IS NULL OR ?)
    `),
    deleteTags: driver.prepare('DELETE FROM asset_tags WHERE asset_id = ?'),
    insertTag: driver.prepare('INSERT OR IGNORE INTO asset_tags (asset_id, tag) VALUES (?, ?)'),
    selectTags: driver.prepare('SELECT tag FROM asset_tags WHERE asset_id = ?'),
    selectAsset: driver.prepare('SELECT * FROM assets WHERE id = ?'),
    selectByRemoteId: driver.prepare(
      'SELECT * FROM assets WHERE remote_asset_id = ? ORDER BY created_at, id LIMIT 1',
    ),
    selectByHash: driver.prepare(
      'SELECT * FROM assets WHERE hash = ? AND missing_at IS NULL ORDER BY created_at, id LIMIT 1',
    ),
    countTypes: driver.prepare(
      `SELECT type, COUNT(*) AS total FROM assets
       WHERE missing_at IS NULL AND ${NOT_PRIVATE} GROUP BY type`,
    ),
    deleteAsset: driver.prepare('DELETE FROM assets WHERE id = ?'),
    orphanChildren: driver.prepare('UPDATE assets SET derived_from = NULL WHERE derived_from = ?'),
  }
}

/** Bytes ON THE DISK right now: fingerprinted, filed, not dated as gone. Asked twice below. */
const HOLDS_BYTES =
  "hash IS NOT NULL AND hash <> '' AND path IS NOT NULL AND path <> '' AND missing_at IS NULL"

/**
 * Every row whose fingerprint another FILED AT ANOTHER PATH also carries.
 *
 * `COUNT(DISTINCT path)`, never `COUNT(*)`: two rows on one path are one file the catalogue
 * holds twice, which is another defect and not a second copy of anything.
 */
const copiesSql = (oneHash: boolean): string => {
  // 🛑 BOTH halves: `COUNT(DISTINCT path)` reads `path` for every row it groups, which no index
  // answers, so leaving the subquery unfiltered scanned the whole table per window opened.
  const narrow = oneHash ? ' AND hash = ?' : ''

  return `
    SELECT hash, id, name, path, bytes, created_at FROM assets
    WHERE ${HOLDS_BYTES}${narrow}
      AND hash IN (
        SELECT hash FROM assets WHERE ${HOLDS_BYTES}${narrow}
        GROUP BY hash HAVING COUNT(DISTINCT path) > 1
      )
    ORDER BY hash, created_at, id
  `
}

export function pathStatements(driver: SqliteDriver) {
  return {
    selectCopies: driver.prepare(copiesSql(false)),
    selectCopiesOf: driver.prepare(copiesSql(true)),
    /**
     * Forgets where the derived files were, for every row that named one.
     *
     * `local_changed_at` is deliberately left alone: it is what the sync reads to decide a row
     * moved, and throwing away a proxy the studio made is not a change to the asset.
     */
    clearDerivedPaths: driver.prepare(
      'UPDATE assets SET proxy_path = NULL, peaks_path = NULL' +
        ' WHERE proxy_path IS NOT NULL OR peaks_path IS NOT NULL',
    ),
    movePaths: driver.prepare(`
      UPDATE assets SET path = ? || substr(path, length(?) + 1) WHERE ${UNDER_PATH}
    `),
    moveConvertedSources: driver.prepare(`
      UPDATE assets SET converted_from = ? || substr(converted_from, length(?) + 1)
      WHERE converted_from IS NOT NULL AND (${UNDER_PATH.replaceAll('path', 'converted_from')})
    `),
    missUnder: driver.prepare(
      `UPDATE assets SET missing_at = ? WHERE missing_at IS NULL AND (${UNDER_PATH})`,
    ),
    selectFiled: driver.prepare(
      "SELECT id, path, hash, missing_at FROM assets WHERE path IS NOT NULL AND path <> ''",
    ),
    setMissingAt: driver.prepare('UPDATE assets SET missing_at = ? WHERE id = ?'),
    selectBackup: driver.prepare(`
      SELECT id, name, type, path, created_at, hash, prompt, model_id, seed FROM assets
      WHERE hash IS NOT NULL AND hash <> '' AND path IS NOT NULL AND path <> ''
      ORDER BY created_at, id
    `),
    rowsChanged: driver.prepare('SELECT changes() AS touched'),
  }
}

export function activityStatements(driver: SqliteDriver) {
  return {
    insertActivity: driver.prepare(`
      INSERT INTO activity (at, level, topic, message_key, params, detail, asset_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `),
    pruneActivity: driver.prepare(
      'DELETE FROM activity WHERE id <= (SELECT MAX(id) FROM activity) - ?',
    ),
    selectActivity: driver.prepare('SELECT * FROM activity ORDER BY id DESC LIMIT ?'),
    selectActivityIds: driver.prepare(
      'SELECT id FROM (SELECT id FROM activity ORDER BY id DESC LIMIT ?) ORDER BY id',
    ),
  }
}
