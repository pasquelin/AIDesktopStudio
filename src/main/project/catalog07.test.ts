import { describe, expect, it, onTestFinished } from 'vitest'

import { createCatalog, migrate } from './catalog'

import { openMemoryDatabase } from './sqliteMemory'

describe('migrating a catalogue that already holds assets', () => {
  it('carries the existing rows across without losing a field', () => {
    const older = openMemoryDatabase()
    onTestFinished(older.close)
    older.exec(`
        CREATE TABLE assets (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, location TEXT NOT NULL,
          path TEXT, remote_asset_id TEXT, job_id TEXT, width INTEGER, height INTEGER,
          bytes INTEGER, created_at TEXT NOT NULL, derived_from TEXT,
          source_path TEXT, hash TEXT, probe TEXT, proxy_path TEXT, peaks_path TEXT,
          map TEXT, map_inverted INTEGER
        );
        CREATE TABLE asset_tags (
          asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
          tag TEXT NOT NULL, PRIMARY KEY (asset_id, tag)
        );
        INSERT INTO assets (id, name, type, location, path, remote_asset_id, created_at, hash)
          VALUES ('asset_old', 'Boulder', 'image', 'local', 'assets/img/asset_old.png',
                  'asset_remote', '2026-08-01T10:00:00.000Z', 'abc123');
        INSERT INTO asset_tags (asset_id, tag) VALUES ('asset_old', 'hero');
        PRAGMA user_version = 3;
      `)

    migrate(older)
    const upgraded = createCatalog(older)
    const found = upgraded.find('asset_old')

    expect(found).toMatchObject({
      id: 'asset_old',
      name: 'Boulder',
      path: 'assets/img/asset_old.png',
      remoteAssetId: 'asset_remote',
      hash: 'abc123',
      tags: ['hero'],
    })
    // Nothing invented for a row that predates the columns: an asset the catalogue never
    // tracked has no provenance, and claiming one would put a prompt on an imported file.
    expect(found?.generation).toBeUndefined()
    expect(found?.syncStatus).toBeUndefined()
    expect(found?.groupId).toBeUndefined()
  })

  /**
   * The words of a project that predates the index. A migration that only started indexing from
   * its next import would leave a library of two thousand assets unsearchable, and nothing on
   * screen would say why.
   */
  it('makes what was already there searchable at once', () => {
    const older = openMemoryDatabase()
    onTestFinished(older.close)
    older.exec(`
        CREATE TABLE assets (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, location TEXT NOT NULL,
          path TEXT, remote_asset_id TEXT, job_id TEXT, width INTEGER, height INTEGER,
          bytes INTEGER, created_at TEXT NOT NULL, derived_from TEXT,
          source_path TEXT, hash TEXT, probe TEXT, proxy_path TEXT, peaks_path TEXT,
          map TEXT, map_inverted INTEGER
        );
        CREATE TABLE asset_tags (
          asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
          tag TEXT NOT NULL, PRIMARY KEY (asset_id, tag)
        );
        INSERT INTO assets (id, name, type, location, created_at)
          VALUES ('asset_old', 'Mossy boulder', 'image', 'local', '2026-08-01T10:00:00.000Z');
        PRAGMA user_version = 3;
      `)

    migrate(older)

    expect(
      createCatalog(older)
        .search({ text: 'mossy' })
        .map(found => found.id),
    ).toEqual(['asset_old'])
  })
})
