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

  it('searches the prompt as well as the name', () => {
    catalog.add(
      asset({
        id: 'a',
        name: 'Flux 1',
        generation: { modelId: 'm', modelLabel: 'M', prompt: 'mossy boulder', params: {} },
      }),
    )
    catalog.add(asset({ id: 'b', name: 'mossy rock' }))

    expect(
      catalog
        .search({ text: 'mossy' })
        .map(one => one.id)
        .sort(),
    ).toEqual(['a', 'b'])
  })
})
