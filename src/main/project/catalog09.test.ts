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
    createdAt: '2026-09-10T10:00:00.000Z',
    ...overrides,
  }
}

describe('catalogue copies', () => {
  let driver: SqliteDriver

  let catalog: Catalog

  beforeEach(() => {
    driver = openMemoryDatabase()
    catalog = createCatalog(driver)
    onTestFinished(driver.close)
  })

  it('groups the fingerprints two live paths carry, and leaves the singles out', () => {
    catalog.add(asset({ id: 'asset_a', path: 'Images/a.png', hash: 'same', bytes: 900 }))
    catalog.add(asset({ id: 'asset_b', path: 'Rushes/b.png', hash: 'same', bytes: 900 }))
    catalog.add(asset({ id: 'asset_c', path: 'Images/c.png', hash: 'alone', bytes: 40 }))

    expect(catalog.copies()).toEqual([
      {
        hash: 'same',
        copies: [
          expect.objectContaining({ path: 'Images/a.png', bytes: 900, store: 'visible' }),
          expect.objectContaining({ path: 'Rushes/b.png', bytes: 900, store: 'visible' }),
        ],
      },
    ])
  })

  /**
   * 🛑 The question is G-P's — the same bytes written twice — and a path is what says twice. Two
   * rows filed at ONE path are one file the catalogue holds twice, which is another defect
   * entirely; reported here they would send someone to delete the only copy they have.
   */
  it('does not read two rows on one path as two copies', () => {
    catalog.add(asset({ id: 'asset_first', path: 'Images/a.png', hash: 'same' }))
    catalog.add(asset({ id: 'asset_again', path: 'Images/a.png', hash: 'same' }))

    expect(catalog.copies()).toEqual([])
  })

  it('leaves out a row whose file was found to be gone', () => {
    catalog.add(asset({ id: 'asset_here', path: 'Images/a.png', hash: 'same' }))
    catalog.add(asset({ id: 'asset_gone', path: 'Rushes/b.png', hash: 'same' }))
    catalog.markMissing('asset_gone', '2026-09-10T11:00:00.000Z')

    expect(catalog.copies()).toEqual([])
  })

  it('answers for one fingerprint when asked for one', () => {
    catalog.add(asset({ id: 'asset_a', path: 'Images/a.png', hash: 'one' }))
    catalog.add(asset({ id: 'asset_b', path: 'Rushes/b.png', hash: 'one' }))
    catalog.add(asset({ id: 'asset_c', path: 'Images/c.png', hash: 'two' }))
    catalog.add(asset({ id: 'asset_d', path: 'Rushes/d.png', hash: 'two' }))

    expect(catalog.copies('two').map(group => group.hash)).toEqual(['two'])
  })

  it('says which store owns each copy, so the studio’s own is never read as the user’s', () => {
    catalog.add(asset({ id: 'asset_own', path: 'Images/a.png', hash: 'same' }))
    catalog.add(asset({ id: 'asset_kept', path: '.resources/img/a.png', hash: 'same' }))

    const stores = catalog.copies()[0]?.copies.map(copy => [copy.path, copy.store])
    expect(stores).toEqual(
      expect.arrayContaining([
        ['Images/a.png', 'visible'],
        ['.resources/img/a.png', 'internal'],
      ]),
    )
  })

  it('forgets every derived path at once and answers how many rows held one', () => {
    catalog.add(asset({ id: 'asset_a', path: 'Rushes/a.mp4', proxyPath: '.index/proxies/a.mp4' }))
    catalog.add(asset({ id: 'asset_b', path: 'Rushes/b.wav', peaksPath: '.index/peaks/b.bin' }))
    catalog.add(asset({ id: 'asset_c', path: 'Images/c.png' }))

    expect(catalog.clearDerivedPaths()).toBe(2)
    expect(catalog.find('asset_a')?.proxyPath).toBeUndefined()
    expect(catalog.find('asset_b')?.peaksPath).toBeUndefined()
  })
})
