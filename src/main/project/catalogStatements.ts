import { NOT_PRIVATE } from './sqlText'
import type { SqliteDriver } from './sqlite'

const UNDER_PATH = 'path = ? OR (path >= ? AND path < ?)'

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

export function pathStatements(driver: SqliteDriver) {
  return {
    movePaths: driver.prepare(`
      UPDATE assets SET path = ? || substr(path, length(?) + 1) WHERE ${UNDER_PATH}
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
