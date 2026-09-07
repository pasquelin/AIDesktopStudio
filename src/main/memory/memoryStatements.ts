import type { SqliteDriver } from '@main/project/sqlite'
import { holes } from '@main/project/sqlText'

function prepareMemoryRows(driver: SqliteDriver, columns: string, columnCount: number) {
  return {
    insertMemory: driver.prepare(
      `INSERT INTO memories (${columns}) VALUES (${holes(columnCount)})`,
    ),
    deleteMemory: driver.prepare('DELETE FROM memories WHERE id = ?'),
    insertRef: driver.prepare(
      'INSERT OR IGNORE INTO memory_refs (memory_id, kind, ref) VALUES (?, ?, ?)',
    ),
    insertLink: driver.prepare('INSERT OR IGNORE INTO memory_links (from_id, to_id) VALUES (?, ?)'),
    countMemories: driver.prepare(
      `SELECT count(*) AS held FROM memories WHERE state IN ('live', 'pinned')`,
    ),
    readMemory: driver.prepare(`SELECT ${columns} FROM memories WHERE id = ?`),
    readStamp: driver.prepare('SELECT bytes, modified_at FROM memory_source'),
    dropStamp: driver.prepare('DELETE FROM memory_source'),
    writeStamp: driver.prepare('INSERT INTO memory_source (bytes, modified_at) VALUES (?, ?)'),
    dropAll: driver.prepare('DELETE FROM memories'),
    readServed: driver.prepare('SELECT id, used_at FROM memories WHERE used_at IS NOT NULL'),
    readOneRefs: driver.prepare(
      `SELECT memory_id, kind, ref FROM memory_refs WHERE memory_id = ? ORDER BY kind, ref`,
    ),
    readOneLinks: driver.prepare(
      `SELECT from_id, to_id FROM memory_links WHERE from_id = ? ORDER BY to_id`,
    ),
  }
}

function prepareMemoryVectors(driver: SqliteDriver, aliased: string) {
  return {
    writeVector: driver.prepare(
      `INSERT INTO memory_vectors (memory_id, text_digest, model, vector) VALUES (?, ?, ?, ?)
       ON CONFLICT(memory_id) DO UPDATE SET text_digest = excluded.text_digest,
         model = excluded.model, vector = excluded.vector`,
    ),
    countPending: driver.prepare(
      `SELECT count(*) AS held FROM memories m
       LEFT JOIN memory_vectors v
         ON v.memory_id = m.id AND v.model = ? AND v.text_digest = m.text_digest
       WHERE v.memory_id IS NULL`,
    ),
    readPending: driver.prepare(
      `SELECT m.id, m.summary, m.body, m.text_digest FROM memories m
       LEFT JOIN memory_vectors v
         ON v.memory_id = m.id AND v.model = ? AND v.text_digest = m.text_digest
       WHERE v.memory_id IS NULL ORDER BY m.created_at, m.id LIMIT ?`,
    ),
    readStanding: driver.prepare(
      `SELECT ${aliased} FROM memories m
       JOIN memory_refs r ON r.memory_id = m.id AND r.kind = ? AND r.ref = ?
       WHERE m.type = ? AND m.state = 'live'
       ORDER BY m.created_at DESC, m.id DESC LIMIT 1`,
    ),
    dropOther: driver.prepare('DELETE FROM memory_vectors WHERE model <> ?'),
    sweepVectorsOf: driver.prepare(
      `SELECT v.memory_id, v.vector FROM memory_vectors v
       JOIN memories m ON m.id = v.memory_id AND m.text_digest = v.text_digest
       WHERE v.model = ?`,
    ),
    dropVector: driver.prepare('DELETE FROM memory_vectors WHERE memory_id = ?'),
    dropOrphans: driver.prepare(
      'DELETE FROM memory_vectors WHERE memory_id NOT IN (SELECT id FROM memories)',
    ),
  }
}

export function prepareMemoryStatements(
  driver: SqliteDriver,
  columns: string,
  aliased: string,
  columnCount: number,
) {
  return {
    ...prepareMemoryRows(driver, columns, columnCount),
    ...prepareMemoryVectors(driver, aliased),
  }
}
