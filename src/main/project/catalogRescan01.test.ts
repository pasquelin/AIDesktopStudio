import { describe, expect, it, onTestFinished } from 'vitest'

import type { Asset } from '@shared/domain/asset'

import { createCatalog, type Catalog } from './catalog'

import { rescanProject, type RescanDisk, type RescanOptions } from './catalogRescan'

import { openMemoryDatabase } from './sqliteMemory'

const NOW = '2026-08-17T10:00:00.000Z'

function catalogWith(rows: readonly { id: string; path: string; hash?: string }[]): Catalog {
  const catalog = createCatalog(openMemoryDatabase())
  onTestFinished(catalog.close)

  for (const row of rows) {
    const asset: Asset = {
      id: row.id,
      name: row.id,
      type: 'image',
      location: 'local',
      tags: [],
      createdAt: '2026-08-01T10:00:00.000Z',
      path: row.path,
      ...(row.hash ? { hash: row.hash } : {}),
    }
    catalog.add(asset)
  }

  return catalog
}

/**
 * A folder written as a table: what it holds, and what each file's bytes fingerprint to.
 *
 * `unseen` is what a walk cannot show but the disk still has — under a dot, past the depth bound,
 * inside a document written as a folder. It is in the table and not in the listing, exactly as
 * the real pair behaves.
 */
function disk(
  files: Record<string, string>,
  unseen: Record<string, string> = {},
): RescanDisk & { hashed: string[] } {
  const hashed: string[] = []
  const all = { ...files, ...unseen }
  return {
    hashed,
    list: () => Promise.resolve(Object.keys(files)),
    exists: path => Promise.resolve(path in all),
    hash: path => {
      hashed.push(path)
      return Promise.resolve(all[path] ?? null)
    },
  }
}

const options = (over: Partial<RescanOptions> = {}): RescanOptions => ({
  now: () => NOW,
  stopped: () => false,
  yieldTo: () => Promise.resolve(),
  onProgress: () => {},
  ...over,
})

const pathsOf = (catalog: Catalog): string[] => catalog.filed().map(row => row.path)

describe('reconciling the catalogue with the disk', () => {
  /**
   * The whole reason the pass exists: a file moved outside the studio is found again by what its
   * bytes fingerprint to, and its row follows it. The id does not change, so every scene holding
   * that texture keeps holding it.
   */
  it('follows a file the user moved, by its fingerprint alone', async () => {
    const catalog = catalogWith([{ id: 'a', path: 'Images/dusk.png', hash: 'h1' }])

    const report = await rescanProject(catalog, disk({ 'Repérages/dusk.png': 'h1' }), options())

    expect(report).toEqual({ moved: 1, missing: 0, returned: 0, complete: true })
    expect(catalog.find('a')?.path).toBe('Repérages/dusk.png')
  })

  // Renamed as well as moved: the name is not what is compared, which is the entire point.
  it('follows one that was renamed on the way', async () => {
    const catalog = catalogWith([{ id: 'a', path: 'Images/dusk.png', hash: 'h1' }])

    await rescanProject(catalog, disk({ 'Repérages/ruelle bleue.png': 'h1' }), options())

    expect(catalog.find('a')?.path).toBe('Repérages/ruelle bleue.png')
  })

  /**
   * The invariant the whole chantier rests on: a row carries the prompt, the seed and the
   * lineage, and none of that is on the disk. Losing it because a file went missing would be
   * losing the only copy.
   */
  it('dates a row whose file has gone, and never drops it', async () => {
    const catalog = catalogWith([{ id: 'a', path: 'Images/dusk.png', hash: 'h1' }])

    const report = await rescanProject(catalog, disk({}), options())

    expect(report).toEqual({ moved: 0, missing: 1, returned: 0, complete: true })
    expect(catalog.find('a')).not.toBeNull()
    expect(catalog.filed()[0]?.missingAt).toBe(NOW)
  })

  it('clears the date when the file is back where the catalogue says', async () => {
    const catalog = catalogWith([{ id: 'a', path: 'Images/dusk.png', hash: 'h1' }])
    await rescanProject(catalog, disk({}), options())

    const report = await rescanProject(catalog, disk({ 'Images/dusk.png': 'h1' }), options())

    expect(report).toEqual({ moved: 0, missing: 0, returned: 1, complete: true })
    expect(catalog.filed()[0]?.missingAt).toBeNull()
  })

  /**
   * Zero false positives. Two files of the same bytes — one picture copied — cannot say which of
   * them a row meant, and guessing would rewrite the path of a row nobody asked to move. The
   * absence stays dated, the files are left alone, and a later pass takes it up if the doubt
   * lifts.
   */
  it('does nothing at all when two files share the fingerprint', async () => {
    const catalog = catalogWith([{ id: 'a', path: 'Images/dusk.png', hash: 'h1' }])

    const report = await rescanProject(
      catalog,
      disk({ 'Repérages/one.png': 'h1', 'Repérages/two.png': 'h1' }),
      options(),
    )

    expect(report).toMatchObject({ moved: 0, missing: 1 })
    expect(catalog.find('a')?.path).toBe('Images/dusk.png')
  })

  // Two rows of the same bytes would otherwise both be refiled at the one file that came back,
  // and the catalogue would hold two rows at one path.
  it('gives a found file to one row only', async () => {
    const catalog = catalogWith([
      { id: 'a', path: 'Images/one.png', hash: 'h1' },
      { id: 'b', path: 'Images/two.png', hash: 'h1' },
    ])

    const report = await rescanProject(catalog, disk({ 'Repérages/kept.png': 'h1' }), options())

    expect(report).toMatchObject({ moved: 1, missing: 1 })
    expect(pathsOf(catalog).filter(path => path === 'Repérages/kept.png')).toHaveLength(1)
  })

  // A file a row already claims is not up for adoption, however its bytes read.
  it('leaves a file another row is filed at alone', async () => {
    const catalog = catalogWith([
      { id: 'a', path: 'Images/gone.png', hash: 'h1' },
      { id: 'b', path: 'Images/here.png', hash: 'h1' },
    ])

    const report = await rescanProject(catalog, disk({ 'Images/here.png': 'h1' }), options())

    expect(report).toMatchObject({ moved: 0, missing: 1 })
    expect(catalog.find('b')?.path).toBe('Images/here.png')
  })

  /**
   * Run on every open and every return to the window, so saying the same thing twice is what
   * would make it noise. Everything it writes is derived from what it read.
   */
  it('reports nothing the second time over the same state', async () => {
    const catalog = catalogWith([{ id: 'a', path: 'Images/dusk.png', hash: 'h1' }])
    const folder = disk({ 'Repérages/dusk.png': 'h1' })

    const first = await rescanProject(catalog, folder, options())
    const second = await rescanProject(catalog, folder, options())

    expect(first).toEqual({ moved: 1, missing: 0, returned: 0, complete: true })
    expect(second).toEqual({ moved: 0, missing: 0, returned: 0, complete: true })
    expect(catalog.find('a')?.path).toBe('Repérages/dusk.png')
  })

  it('says nothing a second time about a row it has already dated', async () => {
    const catalog = catalogWith([{ id: 'a', path: 'Images/dusk.png', hash: 'h1' }])
    await rescanProject(catalog, disk({ 'other.png': 'h2' }), options())

    const second = await rescanProject(catalog, disk({ 'other.png': 'h2' }), options())

    expect(second.missing).toBe(0)
    expect(catalog.filed()[0]?.missingAt).toBe(NOW)
  })

  /**
   * The ordinary pass, and the one that runs on every focus: nothing is lost, so nothing is
   * read. A fingerprint costs three reads of a mebibyte, and paying that for a project where
   * nothing moved would make the pass the thing to be afraid of.
   */
  it('fingerprints nothing when every row is where it says', async () => {
    const catalog = catalogWith([{ id: 'a', path: 'Images/dusk.png', hash: 'h1' }])
    const folder = disk({ 'Images/dusk.png': 'h1', 'Images/other.png': 'h2' })

    await rescanProject(catalog, folder, options())

    expect(folder.hashed).toEqual([])
  })

  /**
   * A row imported before fingerprints were recorded cannot be matched by one, and must not be
   * matched by anything else either — nor cost a single read on its behalf. One such row in a
   * project holding a checkout would otherwise hash ten thousand files for an answer that could
   * never come.
   */
  it('dates a row that carries no fingerprint, without reading a file for it', async () => {
    const catalog = catalogWith([{ id: 'a', path: 'Images/dusk.png' }])
    const folder = disk({ 'Repérages/dusk.png': 'h1', 'Repérages/other.png': 'h2' })

    const report = await rescanProject(catalog, folder, options())

    expect(report).toMatchObject({ moved: 0, missing: 1 })
    expect(folder.hashed).toEqual([])
  })

  // A file that will not read costs the row it might have matched, never the whole pass.
  it('carries on past a file it cannot read', async () => {
    const catalog = catalogWith([{ id: 'a', path: 'Images/dusk.png', hash: 'h1' }])

    const report = await rescanProject(
      catalog,
      disk({ 'Repérages/locked.png': '', 'Repérages/dusk.png': 'h1' }),
      options(),
    )

    expect(report).toMatchObject({ moved: 1, missing: 0 })
  })
})
