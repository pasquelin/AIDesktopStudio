import { describe, expect, it, onTestFinished } from 'vitest'
import type { Asset } from '@shared/domain/asset'
import { memoryCatalog } from './catalog-fixtures'
import { createDocumentDependencies } from './documentDependencies'

const asset = (overrides: Partial<Asset> = {}): Asset => ({
  id: 'asset_1',
  name: 'Facade',
  type: 'image',
  location: 'local',
  tags: [],
  createdAt: '2026-09-10T10:00:00.000Z',
  ...overrides,
})

const reading = (content: string, rows: Asset[]) =>
  createDocumentDependencies({
    read: async () => ({ content }),
    filed: async () =>
      rows.map(row => ({ id: row.id, path: row.path ?? '', hash: null, missingAt: null })),
    rowsOf: async ids => rows.filter(row => ids.includes(row.id)),
  })

describe('what a document cites', () => {
  it('takes the rows whose id the document spells out', async () => {
    const rows = [
      asset({ id: 'asset_sky', path: 'Skies/dusk.hdr' }),
      asset({ id: 'asset_other', path: 'Skies/dawn.hdr' }),
    ]

    const cited = await reading('{"sky":{"assetId":"asset_sky"}}', rows).citedBy('doc', 'scene')

    expect(cited.map(one => one.id)).toEqual(['asset_sky'])
  })

  /** A scene writes its links as URIs, so a space arrives as `%20` and must still be found. */
  it('takes the rows whose name the document writes, encoded or not', async () => {
    const rows = [
      asset({ id: 'asset_plain', path: 'Images/facade.jpg' }),
      asset({ id: 'asset_spaced', path: 'Images/mur nord.jpg' }),
      asset({ id: 'asset_absent', path: 'Images/unused.jpg' }),
    ]

    const cited = await reading('"facade.jpg" and "mur%20nord.jpg"', rows).citedBy('doc', 'scene')

    expect(cited.map(one => one.id)).toEqual(['asset_plain', 'asset_spaced'])
  })

  /**
   * 🛑 It over-reports, exactly as its reverse does — two files of one name in two folders
   * answer for each other. Safe THIS way round: a gathering that copies one file too many
   * leaves the destination able to open the document, where a miss leaves it broken.
   */
  it('answers for both files when two folders hold one name', async () => {
    const rows = [
      asset({ id: 'asset_here', path: 'Images/facade.jpg' }),
      asset({ id: 'asset_there', path: 'Rushes/facade.jpg' }),
    ]

    const cited = await reading('"facade.jpg"', rows).citedBy('doc', 'scene')

    expect(cited).toHaveLength(2)
  })

  it('answers nothing for a document that could not be read', async () => {
    const dependencies = createDocumentDependencies({
      read: async () => null,
      filed: async () => [
        { id: 'asset_1', path: 'Images/facade.jpg', hash: null, missingAt: null },
      ],
      rowsOf: async () => [asset({ path: 'Images/facade.jpg' })],
    })

    expect(await dependencies.citedBy('doc', 'scene')).toEqual([])
  })
})

/**
 * 🛑 Wired to a REAL catalogue, not to a double of it.
 *
 * The first cut read the whole table with `assetsUnder([FOLDER_ROOT])`, which answers NOTHING —
 * « under » is a range scan and the root's range is empty. Every case above passed, because
 * every case above hands `filed` its rows directly. What the defect cost was the entire
 * feature: nothing was ever found to copy.
 */
describe('wired to the catalogue it actually reads', () => {
  it('finds the rows the project holds, whatever folder they sit in', async () => {
    const catalog = memoryCatalog()
    onTestFinished(() => void catalog.close())
    await catalog.add(asset({ id: 'asset_deep', path: 'Images/Studies/facade.jpg' }))
    await catalog.add(asset({ id: 'asset_root', path: 'readme.txt' }))
    await catalog.add(asset({ id: 'asset_absent', path: 'Images/unused.jpg' }))

    const dependencies = createDocumentDependencies({
      read: async () => ({ content: '"facade.jpg" "readme.txt"' }),
      filed: () => catalog.filed(),
      rowsOf: ids => catalog.search({ ids, limit: ids.length }),
    })

    const cited = await dependencies.citedBy('doc', 'scene')

    expect(cited.map(one => one.id).sort()).toEqual(['asset_deep', 'asset_root'])
  })
})
