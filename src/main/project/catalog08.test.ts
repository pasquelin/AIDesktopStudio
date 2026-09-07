import { beforeEach, describe, expect, it, onTestFinished } from 'vitest'

import type { Asset } from '@shared/domain/asset'

import { isPrivatePath } from '@shared/domain/folder'

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

/**
 * What the studio ships into a project sits under a dot folder, and the difference between
 * BROWSING and NAMING is the whole of what lets it be hidden and still resolve.
 */
describe('the studio’s own resources, in the catalogue', () => {
  let driver: SqliteDriver
  let catalog: Catalog

  beforeEach(() => {
    driver = openMemoryDatabase()
    catalog = createCatalog(driver)
    onTestFinished(driver.close)

    catalog.add(asset({ id: 'asset_own', name: 'Boulder', path: 'Images/Boulder.png' }))
    catalog.add(
      asset({
        id: 'asset_shipped',
        name: 'GridLarge',
        path: '.resources/Materials/GridLarge.png',
      }),
    )
  })

  it('leaves them out of a listing, which is what every shelf and picker draws', () => {
    expect(catalog.search({}).map(one => one.id)).toEqual(['asset_own'])
  })

  it('leaves them out of the counts the home draws', () => {
    expect(catalog.countByType().image).toBe(1)
  })

  // A row with no path at all is a LIBRARY asset. Reading the predicate without this half drops
  // every cloud asset from the shelf, which no test of the hiding would have shown.
  it('goes on listing a library row, which has no path to be under a dot', () => {
    catalog.add(asset({ id: 'asset_cloud', location: 'cloud', path: undefined }))

    expect(catalog.search({}).map(one => one.id)).toContain('asset_cloud')
  })

  /**
   * 🛑 An id is a CAPABILITY, a path is not. The window holds the character's id because the scene
   * it opened names it — refusing that answer opened the character's tab titled with a raw uuid,
   * and had the assistant reply « no asset in this library » about a node the studio itself placed.
   */
  it('resolves one asked for by id, which is how a scene reads back what it wears', () => {
    expect(catalog.search({ ids: ['asset_shipped'] })[0]?.id).toBe('asset_shipped')
  })

  /**
   * A path is composed by WALKING the disk, which is exactly how the explorer reaches a dot folder
   * once its eye is open. Only the install of a shipped resource may look one up, and it says so.
   */
  it('refuses one merely named by path, unless the caller asks for the hidden', () => {
    const named = { path: '.resources/Materials/GridLarge.png' }

    expect(catalog.search(named)).toEqual([])
    expect(catalog.search({ ...named, hidden: true })[0]?.id).toBe('asset_shipped')
  })

  // `find` takes an id and answers one row: there is nothing to browse, so nothing to hide from.
  it('resolves one through find, which a scene reading its texture back depends on', () => {
    expect(catalog.find('asset_shipped')?.name).toBe('GridLarge')
  })

  it('hides one under a NESTED dot folder, not only a leading one', () => {
    catalog.add(asset({ id: 'asset_deep', path: 'Modelling/.private/Hidden.png' }))

    expect(catalog.search({}).map(one => one.id)).toEqual(['asset_own'])
  })
})

/**
 * The rule that hides them is spelt TWICE — `isPrivatePath` in TypeScript, `NOT_PRIVATE` in SQL —
 * and SQLite cannot call the first. Nothing else makes the two agree: measured on the same table
 * of paths, so the day one gains a case the other goes red rather than drifting in silence.
 */
describe('the two spellings of a private path', () => {
  let driver: SqliteDriver
  let catalog: Catalog

  const PATHS = [
    'Images/Boulder.png',
    '.resources/Materials/GridLarge.png',
    'Modelling/.private/Hidden.png',
    '.ai-desktop-studio/memory.ndjson',
    'Images/.hidden/One.png',
    'Images/not.a.folder/Two.png',
    'a.b/c.d/Three.png',
  ]

  beforeEach(() => {
    driver = openMemoryDatabase()
    catalog = createCatalog(driver)
    onTestFinished(driver.close)

    PATHS.forEach((path, index) => catalog.add(asset({ id: `asset_${index}`, path })))
  })

  it('agrees on every path, in both languages', () => {
    const listed = new Set(catalog.search({ limit: PATHS.length }).flatMap(one => one.path ?? []))

    expect(PATHS.filter(path => !listed.has(path))).toEqual(
      PATHS.filter(path => isPrivatePath(path)),
    )
  })
})
