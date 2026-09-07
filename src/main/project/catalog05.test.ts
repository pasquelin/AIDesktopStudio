import { beforeEach, describe, expect, it, onTestFinished } from 'vitest'

import type { Asset } from '@shared/domain/asset'

import { createCatalog, type Catalog } from './catalog'

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

describe('catalogue provenance and sync', () => {
  let driver: SqliteDriver

  let catalog: Catalog

  beforeEach(() => {
    driver = openMemoryDatabase()
    catalog = createCatalog(driver)
    onTestFinished(driver.close)
  })

  it('keeps a generation through a round trip', () => {
    const generation = {
      modelId: 'model_flux',
      modelLabel: 'Flux 1.1 Pro',
      prompt: 'mossy boulder, overcast',
      params: { guidance: 3.5, scheduler: 'euler' },
      seed: 42,
    }
    catalog.add(asset({ generation }))

    expect(catalog.find('asset_1')?.generation).toEqual(generation)
  })

  it('leaves an imported file without a generation rather than an empty one', () => {
    catalog.add(asset())
    expect(catalog.find('asset_1')?.generation).toBeUndefined()
  })

  it('keeps a generation whose seed the model never reported', () => {
    catalog.add(asset({ generation: { modelId: 'm', modelLabel: 'M', prompt: 'p', params: {} } }))

    const found = catalog.find('asset_1')?.generation
    expect(found).toEqual({ modelId: 'm', modelLabel: 'M', prompt: 'p', params: {} })
    expect(found && 'seed' in found).toBe(false)
  })

  it('keeps the twin and its three stamps through a round trip', () => {
    const twin: Partial<Asset> = {
      remoteAssetId: 'asset_remote',
      remoteOwnerId: 'proj_a',
      remoteUpdatedAt: '2026-08-06T09:00:00.000Z',
      remoteSyncedAt: '2026-08-06T09:30:00.000Z',
      localChangedAt: '2026-08-06T10:00:00.000Z',
      syncStatus: 'local-ahead',
      syncError: 'upload-too-large',
    }
    catalog.add(asset(twin))

    expect(catalog.find('asset_1')).toMatchObject(twin)
  })

  it('drops a sync state this build no longer knows rather than carrying it out of the union', () => {
    catalog.add(asset({ syncStatus: 'synced' }))
    // Written straight to the column, as a build that knew a seventh state would have left it.
    driver.prepare("UPDATE assets SET sync_state = 'quarantined' WHERE id = ?").run('asset_1')

    expect(catalog.find('asset_1')?.syncStatus).toBeUndefined()
  })

  it('reads the members of one generation in the order the API produced them', () => {
    for (const [index, name] of ['albedo', 'normal', 'height'].entries()) {
      catalog.add(
        asset({
          id: `asset_${index}`,
          name,
          type: 'image',
          groupId: 'job_1',
          outputIndex: 2 - index,
          createdAt: `2026-08-06T10:0${index}:00.000Z`,
        }),
      )
    }

    expect(catalog.search({ groupId: 'job_1' }).map(found => found.name)).toEqual([
      'height',
      'normal',
      'albedo',
    ])
  })

  it('narrows to the kinds a workspace accepts', () => {
    catalog.add(asset({ id: 'a', type: 'image' }))
    catalog.add(asset({ id: 'b', type: 'audio' }))
    catalog.add(asset({ id: 'c', type: 'image' }))

    const found = catalog.search({ types: ['image'] })
    expect(found.map(one => one.id).sort()).toEqual(['a', 'c'])
  })

  it('shows nothing for a workspace that accepts nothing', () => {
    // An empty list is "nothing", not "no filter" — otherwise it would show everything.
    catalog.add(asset())
    expect(catalog.search({ types: [] })).toEqual([])
  })

  it('narrows by where the bytes are and by what is still to move', () => {
    catalog.add(asset({ id: 'a', location: 'local', syncStatus: 'local-ahead' }))
    catalog.add(asset({ id: 'b', location: 'cloud', syncStatus: 'synced' }))

    expect(catalog.search({ location: 'cloud' }).map(one => one.id)).toEqual(['b'])
    expect(catalog.search({ syncStatus: 'local-ahead' }).map(one => one.id)).toEqual(['a'])
  })

  it('counts every kind, zeroes included', () => {
    catalog.add(asset({ id: 'a', type: 'image' }))
    catalog.add(asset({ id: 'b', type: 'image' }))
    catalog.add(asset({ id: 'c', type: 'skybox' }))

    expect(catalog.countByType()).toEqual({
      image: 2,
      video: 0,
      audio: 0,
      mesh: 0,
      skybox: 1,
      animation: 0,
    })
  })

  // The column is a free string in SQLite, as everywhere else here: a row written by a build
  // that knew a seventh kind must not be counted under one of the six this one knows.
  it('leaves a kind this build no longer knows out of the totals', () => {
    catalog.add(asset({ id: 'a', type: 'image' }))
    driver.exec(`
        INSERT INTO assets (id, name, type, location, created_at)
        VALUES ('b', 'hologram', 'hologram', 'local', '2026-08-08T10:00:00.000Z')
      `)

    expect(catalog.countByType()).toMatchObject({ image: 1 })
  })

  it('narrows to what a model produced, leaving imports out', () => {
    catalog.add(
      asset({
        id: 'made',
        generation: { modelId: 'flux', modelLabel: 'FLUX', prompt: 'a boulder', params: {} },
      }),
    )
    catalog.add(asset({ id: 'imported' }))

    expect(catalog.search({ generated: true }).map(one => one.id)).toEqual(['made'])
  })
})
