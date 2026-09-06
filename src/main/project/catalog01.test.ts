import { beforeEach, describe, expect, it, onTestFinished } from 'vitest'

import type { Asset } from '@shared/domain/asset'

import { createCatalog, migrate, type Catalog } from './catalog'

import { openMemoryDatabase } from './sqliteMemory'

import type { SqliteDriver } from './sqlite'

function asset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'asset_1',
    name: 'Boulder',
    type: 'image',
    location: 'local',
    tags: [],
    createdAt: '2026-08-06T10:00:00.000Z',
    ...overrides,
  }
}

describe('catalog', () => {
  let driver: SqliteDriver

  let catalog: Catalog

  beforeEach(() => {
    driver = openMemoryDatabase()
    catalog = createCatalog(driver)
    onTestFinished(driver.close)
  })

  it('keeps the ingest columns through a round trip', () => {
    catalog.add(
      asset({
        id: 'asset_rush',
        name: 'rush.mov',
        type: 'video',
        sourcePath: '/Volumes/Rushes/rush.mov',
        hash: 'abc123',
        probe: { duration: 20_000_000, codec: 'prores', width: 3840, height: 2160, fps: 25 },
        proxyPath: '.index/proxies/abc123.mp4',
        peaksPath: '.index/peaks/abc123.bin',
      }),
    )

    const found = catalog.find('asset_rush')
    expect(found?.sourcePath).toBe('/Volumes/Rushes/rush.mov')
    expect(found?.hash).toBe('abc123')
    expect(found?.probe).toEqual({
      duration: 20_000_000,
      codec: 'prores',
      width: 3840,
      height: 2160,
      fps: 25,
    })
    expect(found?.proxyPath).toBe('.index/proxies/abc123.mp4')
    expect(found?.peaksPath).toBe('.index/peaks/abc123.bin')
  })

  // The still of a mesh, which its own file cannot stand in for — see `posterUrl`.
  it('keeps the still recorded beside an asset through a round trip', () => {
    catalog.add(
      asset({ id: 'asset_mesh', type: 'mesh', posterPath: '.index/posters/asset_mesh.jpg' }),
    )

    expect(catalog.find('asset_mesh')?.posterPath).toBe('.index/posters/asset_mesh.jpg')
    expect(catalog.find('asset_mesh')?.type).toBe('mesh')
  })

  it('keeps where a converted model came from, and what the conversion lost, through a round trip', () => {
    catalog.add(
      asset({
        id: 'asset_robot',
        type: 'mesh',
        path: 'models/robot.glb',
        convertedFrom: 'models/.sources/robot.fbx',
        importLosses: ['textures'],
      }),
    )

    expect(catalog.find('asset_robot')).toMatchObject({
      convertedFrom: 'models/.sources/robot.fbx',
      importLosses: ['textures'],
    })
    expect(catalog.find('asset_1')?.convertedFrom).toBeUndefined()
  })

  it('holds an OpenEXR heightmap as an image', () => {
    catalog.add(asset({ id: 'asset_height', name: 'height', path: 'World/height.exr' }))

    expect(catalog.find('asset_height')).toMatchObject({
      type: 'image',
      path: 'World/height.exr',
    })
  })

  it('leaves it absent on an asset nothing wrote one for', () => {
    catalog.add(asset())

    expect(catalog.find('asset_1')?.posterPath).toBeUndefined()
  })

  it('leaves the ingest columns absent on an asset that has never been probed', () => {
    catalog.add(asset())
    const found = catalog.find('asset_1')
    expect(found?.hash).toBeUndefined()
    expect(found?.probe).toBeUndefined()
  })

  it('drops a probe that no longer parses rather than failing the whole read', () => {
    catalog.add(asset({ id: 'asset_bad' }))
    driver.prepare('UPDATE assets SET probe = ? WHERE id = ?').run('{ not json', 'asset_bad')
    expect(catalog.find('asset_bad')?.probe).toBeUndefined()
  })

  it('opens a catalogue created before the ingest columns existed', () => {
    // Append-only migrations: a project made yesterday has to open today.
    const older = openMemoryDatabase()
    onTestFinished(older.close)
    older.exec(`
        CREATE TABLE assets (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, location TEXT NOT NULL,
          path TEXT, remote_asset_id TEXT, job_id TEXT, width INTEGER, height INTEGER,
          bytes INTEGER, created_at TEXT NOT NULL, derived_from TEXT
        );
        CREATE TABLE asset_tags (
          asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
          tag TEXT NOT NULL, PRIMARY KEY (asset_id, tag)
        );
        CREATE INDEX assets_type_idx       ON assets(type);
        CREATE INDEX assets_created_at_idx ON assets(created_at DESC);
        CREATE INDEX asset_tags_tag_idx    ON asset_tags(tag);
        PRAGMA user_version = 1;
      `)

    migrate(older)
    const upgraded = createCatalog(older)
    upgraded.add(
      asset({
        id: 'asset_old',
        hash: 'def456',
        map: 'normal',
        posterPath: '.index/posters/asset_old.jpg',
      }),
    )

    expect(upgraded.find('asset_old')?.hash).toBe('def456')
    expect(upgraded.find('asset_old')?.map).toBe('normal')
    // The newest column too: a project opened for the first time on this build is the ordinary
    // case, not the exception, and a migration list read in the wrong order lands exactly here.
    expect(upgraded.find('asset_old')?.posterPath).toBe('.index/posters/asset_old.jpg')
  })

  it('keeps a channel and its reading direction through a round trip', () => {
    catalog.add(asset({ id: 'asset_rough', map: 'roughness', mapInverted: true }))
    catalog.add(asset({ id: 'asset_norm', map: 'normal' }))

    expect(catalog.find('asset_rough')).toMatchObject({ map: 'roughness', mapInverted: true })
    expect(catalog.find('asset_norm')?.map).toBe('normal')
    // Absent rather than false: an ordinary map is not "a map that is not inverted".
    expect(catalog.find('asset_norm')?.mapInverted).toBeUndefined()
  })

  it('keeps the recipe and assembled materials of an extracted model through a round trip', () => {
    const modelTextureUses: NonNullable<Asset['modelTextureUses']> = [
      {
        materialIndex: 0,
        materialName: 'Shell',
        slot: 'baseColorTexture',
        channel: 'baseColor',
        sampling: { channel: 1, wrapS: 33648, wrapT: 10497, minFilter: 9728, magFilter: 9729 },
        settings: {
          color: '#ffffff',
          roughness: 1,
          metalness: 0,
          normalScale: 1,
          aoIntensity: 1,
          emissive: '#000000',
          emissiveIntensity: 1,
          tiling: { x: 1, y: 1 },
          offset: { x: 0, y: 0 },
          rotation: 0,
        },
      },
    ]
    catalog.add(asset({ id: 'model', modelMaterialIds: ['material'], modelTextureUses }))

    expect(catalog.find('model')).toMatchObject({
      modelMaterialIds: ['material'],
      modelTextureUses,
    })
  })

  it('leaves a picture that carries no channel alone', () => {
    catalog.add(asset({ id: 'asset_plain' }))
    expect(catalog.find('asset_plain')?.map).toBeUndefined()
  })

  it('finds the local asset an API one became', () => {
    catalog.add(asset({ id: 'asset_local', remoteAssetId: 'remote_1' }))
    expect(catalog.findByRemoteId('remote_1')?.id).toBe('asset_local')
    expect(catalog.findByRemoteId('remote_unknown')).toBeNull()
  })

  // Re-importing the same API asset must not move where its channels point.
  it('answers with the oldest local asset when one was imported twice', () => {
    catalog.add(asset({ id: 'asset_b', remoteAssetId: 'remote_1', createdAt: '2026-08-07T00:00Z' }))
    catalog.add(asset({ id: 'asset_a', remoteAssetId: 'remote_1', createdAt: '2026-08-06T00:00Z' }))

    expect(catalog.findByRemoteId('remote_1')?.id).toBe('asset_a')
  })

  // The column is a free string, and a catalogue outlives the build that wrote it.
  it('ignores a channel this build no longer knows rather than failing the read', () => {
    catalog.add(asset({ id: 'asset_odd', map: 'normal' }))
    driver.prepare('UPDATE assets SET map = ? WHERE id = ?').run('cavity', 'asset_odd')

    const found = catalog.find('asset_odd')
    expect(found?.map).toBeUndefined()
    expect(found?.id).toBe('asset_odd')
  })
})
