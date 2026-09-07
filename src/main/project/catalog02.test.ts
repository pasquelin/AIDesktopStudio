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

describe('catalog', () => {
  let driver: SqliteDriver

  let catalog: Catalog

  beforeEach(() => {
    driver = openMemoryDatabase()
    catalog = createCatalog(driver)
    onTestFinished(driver.close)
  })

  it('reads back everything it stored', () => {
    catalog.add(
      asset({
        path: 'assets/img/asset_1.png',
        remoteAssetId: 'asset_remote',
        jobId: 'job_1',
        width: 1024,
        height: 768,
        bytes: 4096,
        derivedFrom: 'asset_0',
        tags: ['stone', 'set-dressing'],
      }),
    )

    expect(catalog.find('asset_1')).toEqual({
      id: 'asset_1',
      name: 'Boulder',
      type: 'image',
      location: 'local',
      path: 'assets/img/asset_1.png',
      remoteAssetId: 'asset_remote',
      jobId: 'job_1',
      width: 1024,
      height: 768,
      bytes: 4096,
      derivedFrom: 'asset_0',
      tags: ['set-dressing', 'stone'],
      createdAt: '2026-08-06T10:00:00.000Z',
    })
  })

  it('answers nothing for an unknown asset', () => {
    expect(catalog.find('asset_missing')).toBeNull()
  })

  // The emoji is the case: `find` and the page path used to order tags by two rules that agree
  // over the whole BMP and part ways above it, so any tag staying inside it — accents included —
  // hid the split. See `catalog.ts`.
  it('answers one order for the tags of an asset, read alone or through a page', () => {
    catalog.add(asset({ id: 'asset_1', tags: ['Zoom', 'Éclairage', 'ﬀusion', '🌟etoile'] }))

    const alone = catalog.find('asset_1')?.tags
    const [inPage] = catalog.search({})

    expect(alone).toEqual(inPage?.tags)
    expect(alone).toEqual(['Zoom', 'Éclairage', '🌟etoile', 'ﬀusion'])
  })

  it('finds an asset by name, whatever the case', () => {
    catalog.add(asset({ id: 'asset_1', name: 'Mossy boulder' }))
    catalog.add(asset({ id: 'asset_2', name: 'Sky' }))

    expect(catalog.search({ text: 'boulder' }).map(found => found.id)).toEqual(['asset_1'])
  })

  /**
   * A renamed asset must not answer to the name it no longer has. The full-text index is an
   * external-content fts5 table kept by three triggers, and a row written over does not fire the
   * DELETE one unless `recursive_triggers` is on — so the old name stayed indexed under a rowid
   * the write had just freed, and searching for it found the asset under its new name.
   */
  it('stops answering to the name an asset no longer has', () => {
    catalog.add(asset({ id: 'asset_1', name: 'Mossy boulder' }))
    catalog.add(asset({ id: 'asset_1', name: 'Rocher moussu' }))

    expect(catalog.search({ text: 'boulder' })).toEqual([])
    expect(catalog.search({ text: 'moussu' }).map(found => found.id)).toEqual(['asset_1'])
  })

  it('treats a wildcard typed by the user as a literal character', () => {
    catalog.add(asset({ id: 'asset_1', name: 'Boulder' }))
    catalog.add(asset({ id: 'asset_2', name: '100%' }))

    expect(catalog.search({ text: '%' }).map(found => found.id)).toEqual(['asset_2'])
  })

  /**
   * The search runs on every keystroke, so a word half typed has to find its row — that is what
   * the trailing star of the fts5 expression is for.
   */
  it('finds a word still being typed', () => {
    catalog.add(asset({ id: 'asset_1', name: 'Mossy boulder' }))
    catalog.add(asset({ id: 'asset_2', name: 'Sky' }))

    expect(catalog.search({ text: 'mos' }).map(found => found.id)).toEqual(['asset_1'])
  })

  /** Filters narrow: two words are two conditions, not two chances. */
  it('asks for every word, not any of them', () => {
    catalog.add(asset({ id: 'asset_1', name: 'Mossy boulder' }))
    catalog.add(asset({ id: 'asset_2', name: 'Mossy sky' }))

    expect(catalog.search({ text: 'mossy boulder' }).map(found => found.id)).toEqual(['asset_1'])
  })

  /** Typed in a hurry, without the accent the name carries. */
  it('folds the accents away on both sides', () => {
    catalog.add(asset({ id: 'asset_1', name: 'Pierre moussée' }))

    expect(catalog.search({ text: 'moussee' }).map(found => found.id)).toEqual(['asset_1'])
  })

  /**
   * The words are indexed in a table of their own, and nothing keeps it true but the triggers.
   * Without them a deleted asset stays findable — a row the studio would then fail to open.
   */
  it('forgets the words of an asset that is gone', () => {
    catalog.add(asset({ id: 'asset_1', name: 'Mossy boulder' }))
    catalog.remove('asset_1')

    expect(catalog.search({ text: 'mossy' })).toEqual([])
  })

  /**
   * SQLite hands a freed rowid back out: delete the only asset and the next one takes its place
   * in the table. The words of the first are keyed on that number — left behind, they answer for
   * the second, and searching "mossy" returns an asset called "Dry sky".
   */
  it('does not let the words of a deleted asset answer for the one that takes its place', () => {
    catalog.add(asset({ id: 'asset_1', name: 'Mossy boulder' }))
    catalog.remove('asset_1')
    catalog.add(asset({ id: 'asset_2', name: 'Dry sky' }))

    expect(catalog.search({ text: 'mossy' })).toEqual([])
    expect(catalog.search({ text: 'dry' }).map(found => found.id)).toEqual(['asset_2'])
  })

  it('forgets the name an asset used to carry', () => {
    catalog.add(asset({ id: 'asset_1', name: 'Mossy boulder' }))
    catalog.add(asset({ id: 'asset_1', name: 'Dry boulder' }))

    expect(catalog.search({ text: 'mossy' })).toEqual([])
    expect(catalog.search({ text: 'dry' }).map(found => found.id)).toEqual(['asset_1'])
  })
})
