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

  it('narrows on every tag at once rather than any of them', () => {
    catalog.add(asset({ id: 'asset_1', tags: ['stone', 'set-dressing'] }))
    catalog.add(asset({ id: 'asset_2', tags: ['stone'] }))

    expect(catalog.search({ tags: ['stone', 'set-dressing'] }).map(found => found.id)).toEqual([
      'asset_1',
    ])
    expect(catalog.search({ tags: ['stone'] })).toHaveLength(2)
  })

  it('filters by type', () => {
    catalog.add(asset({ id: 'asset_1', type: 'image' }))
    catalog.add(asset({ id: 'asset_2', type: 'mesh' }))

    expect(catalog.search({ type: 'mesh' }).map(found => found.id)).toEqual(['asset_2'])
  })

  /**
   * What the explorer asks before it hands a file to the system: the folder shows a file name,
   * and only the catalogue can say whether that file is an asset this studio edits.
   */
  it('finds the asset filed at a path, and nothing else', () => {
    catalog.add(asset({ id: 'asset_1', path: 'assets/img/asset_1.png' }))
    catalog.add(asset({ id: 'asset_2', path: 'assets/img/asset_2.png' }))

    const found = catalog.search({ path: 'assets/img/asset_2.png' })
    expect(found.map(one => one.id)).toEqual(['asset_2'])
  })

  /**
   * The same question for a whole listing, in one round trip: a browser showing four hundred
   * files asked four hundred times, and each answer is a query against this database.
   */
  it('answers for a whole listing of paths at once', () => {
    catalog.add(asset({ id: 'asset_1', path: 'Repérages/ruelle.png' }))
    catalog.add(asset({ id: 'asset_2', path: 'Repérages/toit.png' }))
    catalog.add(asset({ id: 'asset_3', path: 'ailleurs/rien.png' }))

    const found = catalog.search({ paths: ['Repérages/ruelle.png', 'Repérages/toit.png'] })
    expect(found.map(one => one.id).sort()).toEqual(['asset_1', 'asset_2'])
  })

  /**
   * By id, which is all a finished generation hands back — `metadata.assetIds` and nothing else.
   * The catalogue could be asked by path, by group and by origin, but never by the identifier
   * the API itself answers in, so its own output was the one thing it could not look up.
   */
  it('answers for a set of ids, which is what a generation hands back', () => {
    catalog.add(asset({ id: 'asset_1' }))
    catalog.add(asset({ id: 'asset_2' }))
    catalog.add(asset({ id: 'asset_3' }))

    expect(
      catalog
        .search({ ids: ['asset_1', 'asset_3'] })
        .map(one => one.id)
        .sort(),
    ).toEqual(['asset_1', 'asset_3'])
    expect(catalog.search({ ids: [] })).toEqual([])
  })

  // As `types` does, and for the same reason: a caller with nothing to ask about asks nothing,
  // where an empty list read as « no filter » would answer with the whole catalogue.
  it('answers nothing at all for an empty listing', () => {
    catalog.add(asset({ id: 'asset_1', path: 'Repérages/ruelle.png' }))

    expect(catalog.search({ paths: [] })).toEqual([])
  })

  // Exact, never a prefix: the question is « is THIS file an asset », and a folder that shares
  // the opening of a file name is not the file.
  it('answers nothing for a path no asset was filed at', () => {
    catalog.add(asset({ id: 'asset_1', path: 'assets/img/asset_1.png' }))

    expect(catalog.search({ path: 'assets/img' })).toEqual([])
    expect(catalog.search({ path: 'assets/img/stray.png' })).toEqual([])
  })

  describe('following a file that moved', () => {
    const pathOf = (id: string): string | undefined => catalog.find(id)?.path

    it('refiles a folder and everything under it, keeping every id', () => {
      catalog.add(asset({ id: 'asset_1', path: 'Rushes/A001.mov' }))
      catalog.add(asset({ id: 'asset_2', path: 'Rushes/day two/A002.mov' }))
      catalog.add(asset({ id: 'asset_3', path: 'Stills/A003.png' }))

      catalog.repath('Rushes', 'Footage/Raw')

      expect(pathOf('asset_1')).toBe('Footage/Raw/A001.mov')
      expect(pathOf('asset_2')).toBe('Footage/Raw/day two/A002.mov')
      expect(pathOf('asset_3')).toBe('Stills/A003.png')
    })

    it('refiles the source recorded for a converted asset with its folder', () => {
      catalog.add(
        asset({
          id: 'asset_1',
          path: 'Rushes/Robot/Robot.glb',
          convertedFrom: 'Rushes/Robot/.sources/Robot.fbx',
        }),
      )

      catalog.repath('Rushes', 'Models')

      expect(catalog.find('asset_1')?.convertedFrom).toBe('Models/Robot/.sources/Robot.fbx')
    })

    // What makes a replayed move journal safe: the second pass finds nothing where the first
    // one already moved everything.
    it('writes nothing the second time, and nothing for a path no row is at', () => {
      catalog.add(asset({ id: 'asset_1', path: 'Rushes/A001.mov' }))

      catalog.repath('Rushes', 'Footage')
      catalog.repath('Rushes', 'Elsewhere')
      catalog.repath('Nowhere', 'Somewhere')

      expect(pathOf('asset_1')).toBe('Footage/A001.mov')
    })

    /**
     * Rewriting `Rushes` to `Rushes/2024` leaves rows that still begin with `Rushes/`, so a
     * second pass would file them at `Rushes/2024/2024/…` — and a journal replayed at every
     * opening sinks them one level deeper each time.
     */
    it('refuses to move a folder into itself, which would never settle', () => {
      catalog.add(asset({ id: 'asset_1', path: 'Rushes/A001.mov' }))

      catalog.repath('Rushes', 'Rushes/2024')

      expect(pathOf('asset_1')).toBe('Rushes/A001.mov')
    })

    // One folder to the filesystem, two strings to SQLite. Left as typed, this moved nothing at
    // all — silently, and after the files had already gone.
    it('reads a trailing slash as the same folder', () => {
      catalog.add(asset({ id: 'asset_1', path: 'Rushes/A001.mov' }))

      catalog.repath('Rushes/', 'Footage')

      expect(pathOf('asset_1')).toBe('Footage/A001.mov')
    })

    // `LIKE` is case-insensitive over ASCII in SQLite, and would have carried this one along.
    it('leaves a folder whose name differs only in case', () => {
      catalog.add(asset({ id: 'asset_1', path: 'Rushes/A001.mov' }))
      catalog.add(asset({ id: 'asset_2', path: 'RUSHES/A002.mov' }))

      catalog.repath('Rushes', 'Footage')

      expect(pathOf('asset_1')).toBe('Footage/A001.mov')
      expect(pathOf('asset_2')).toBe('RUSHES/A002.mov')
    })

    // `LIKE` would have read these as wildcards and swept in paths having nothing to do with
    // the folder that moved.
    it('is not fooled by a folder whose name holds a wildcard character', () => {
      catalog.add(asset({ id: 'asset_1', path: '100%_final/A001.mov' }))
      catalog.add(asset({ id: 'asset_2', path: '100Xdone/A002.mov' }))

      catalog.repath('100%_final', 'Done')

      expect(pathOf('asset_1')).toBe('Done/A001.mov')
      expect(pathOf('asset_2')).toBe('100Xdone/A002.mov')
    })

    // SQLite counts characters where JavaScript counts UTF-16 units: a length measured on the
    // wrong side cuts one unit too far and rewrites every path under it wrong.
    it('cuts a folder named with an emoji at the right place', () => {
      catalog.add(asset({ id: 'asset_1', path: '🎬 Rushes/A001.mov' }))

      catalog.repath('🎬 Rushes', 'Footage')

      expect(pathOf('asset_1')).toBe('Footage/A001.mov')
    })

    /**
     * The trash is reversible, so the row is DATED and not dropped: a file the user takes back
     * out is found where the catalogue still says it is, and the next pass clears the date. A
     * row deleted the moment the file went to the trash would leave a restored file with no
     * prompt, no seed and no lineage — the one copy of all three.
     */
    it('dates a trashed folder and every row beneath it, and says how many it touched', () => {
      catalog.add(asset({ id: 'asset_1', path: 'Rushes/A001.mov' }))
      catalog.add(asset({ id: 'asset_2', path: 'Rushes/day two/A002.mov' }))
      catalog.add(asset({ id: 'asset_3', path: 'Rushesque/A003.mov' }))

      expect(catalog.forgetUnder('Rushes/')).toBe(2)

      // Gone from every listing, and still there.
      expect(catalog.search({})).toEqual([expect.objectContaining({ id: 'asset_3' })])
      expect(catalog.find('asset_1')).not.toBeNull()
      expect(catalog.filed().find(row => row.path === 'Rushes/A001.mov')?.missingAt).not.toBeNull()
      expect(pathOf('asset_3')).toBe('Rushesque/A003.mov')
    })

    // Run twice over the same state, the second pass has nothing to say — which is what lets the
    // handler use the count to decide whether a window has any reason to reload.
    it('says nothing the second time about a folder already dated', () => {
      catalog.add(asset({ id: 'asset_1', path: 'Rushes/A001.mov' }))

      expect(catalog.forgetUnder('Rushes')).toBe(1)
      expect(catalog.forgetUnder('Rushes')).toBe(0)
    })

    // What tells the handler whether any window has a reason to reload.
    it('says nothing went for a path the catalogue never knew', () => {
      expect(catalog.forgetUnder('Notes')).toBe(0)
    })
  })

  it('returns the most recent first, and paginates', () => {
    catalog.add(asset({ id: 'asset_old', createdAt: '2026-08-01T10:00:00.000Z' }))
    catalog.add(asset({ id: 'asset_new', createdAt: '2026-08-06T10:00:00.000Z' }))

    expect(catalog.search({}).map(found => found.id)).toEqual(['asset_new', 'asset_old'])
    expect(catalog.search({ limit: 1 }).map(found => found.id)).toEqual(['asset_new'])
    expect(catalog.search({ limit: 1, offset: 1 }).map(found => found.id)).toEqual(['asset_old'])
  })

  it('replaces an asset instead of duplicating it, tags included', () => {
    catalog.add(asset({ tags: ['draft'] }))
    catalog.add(asset({ name: 'Final boulder', tags: ['approved'] }))

    expect(catalog.search({})).toHaveLength(1)
    expect(catalog.find('asset_1')?.tags).toEqual(['approved'])
  })

  it('removes the tags of a deleted asset', () => {
    catalog.add(asset({ tags: ['stone'] }))
    driver.prepare('DELETE FROM assets WHERE id = ?').run('asset_1')

    expect(driver.prepare('SELECT COUNT(*) AS total FROM asset_tags').get()?.['total']).toBe(0)
  })

  it('finds a row by the bytes it holds, which is what a second import matches on', () => {
    catalog.add(asset({ id: 'asset_rush', hash: 'abc123' }))

    expect(catalog.findByHash('abc123')?.id).toBe('asset_rush')
    expect(catalog.findByHash('other')).toBeNull()
  })
})
