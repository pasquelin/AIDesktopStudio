import { describe, expect, it, onTestFinished, vi } from 'vitest'

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

describe('reconciling the catalogue with the disk', () => {
  /**
   * A stop is read BETWEEN batches, which is the only place it can be honoured — a fingerprint
   * cannot be interrupted once begun. What it buys is the batches that have not started.
   */
  it('stops between batches, and says the pass was not complete', async () => {
    const catalog = catalogWith([{ id: 'a', path: 'Images/dusk.png', hash: 'h1' }])
    const files: Record<string, string> = {}
    for (let index = 0; index < 300; index += 1) files[`orphan ${index}.png`] = `h${index}`
    const folder = disk(files)

    let passes = 0
    const report = await rescanProject(
      catalog,
      folder,
      options({
        stopped: () => passes++ > 0,
      }),
    )

    expect(report.complete).toBe(false)
    // One batch of 128, and the second turned away rather than the whole 300.
    expect(folder.hashed).toHaveLength(128)
    // Nothing written by a pass that did not finish: the row is neither moved nor dated.
    expect(catalog.filed()[0]).toMatchObject({ path: 'Images/dusk.png', missingAt: null })
  })

  /**
   * The walk is a READER's view and turns three families away: what sits under a dot, what is
   * deeper than its bound, and what a document written as a folder holds. A row filed at one of
   * those is not gone — it is out of sight — and dating it would take the asset out of the
   * library for good while its file sat there, permanently, since no later pass could see it
   * either.
   */
  it('does not date a row whose file the walk cannot show but the disk still has', async () => {
    const catalog = catalogWith([{ id: 'a', path: '.archives/dusk.png', hash: 'h1' }])

    const report = await rescanProject(catalog, disk({}, { '.archives/dusk.png': 'h1' }), options())

    expect(report).toEqual({ moved: 0, missing: 0, returned: 0, complete: true })
    expect(catalog.filed()[0]?.missingAt).toBeNull()
  })

  /**
   * A project on a network share that unmounts mid-pass answers an empty walk for everything.
   * Dating on the walk alone would empty the library in one go — and since `search` hides what is
   * dated, the user would watch a project of ten thousand assets become a project of none.
   */
  it('dates nothing when the folder answers nothing but the files are there', async () => {
    const catalog = catalogWith([
      { id: 'a', path: 'Images/one.png', hash: 'h1' },
      { id: 'b', path: 'Images/two.png', hash: 'h2' },
    ])

    const report = await rescanProject(
      catalog,
      disk({}, { 'Images/one.png': 'h1', 'Images/two.png': 'h2' }),
      options(),
    )

    expect(report.missing).toBe(0)
    expect(catalog.filed().every(row => row.missingAt === null)).toBe(true)
  })

  /**
   * The trash has to stick. `forgetUnder` dates the rows of a folder the user threw away, and a
   * fingerprint search would hand one of them back on the first identical file it found
   * elsewhere — a reference copy the user keeps, say — undoing a deliberate gesture with an
   * automatic pass, and pointing the row at a file that was never an asset.
   *
   * A dated row comes back the one way that cannot be mistaken: its own file, at its own path.
   */
  it('does not claim a file for a row whose absence was already recorded', async () => {
    const catalog = catalogWith([{ id: 'a', path: 'Images/logo.png', hash: 'h1' }])
    await rescanProject(catalog, disk({}), options())

    const report = await rescanProject(catalog, disk({ 'refs/logo.png': 'h1' }), options())

    expect(report).toMatchObject({ moved: 0, missing: 0 })
    expect(catalog.find('a')?.path).toBe('Images/logo.png')
  })

  // And the reads that would have gone looking do not happen either: one file deleted for good
  // must not re-hash every uncatalogued file of the project on every return to the window.
  it('reads nothing more for a row it has already given up on', async () => {
    const catalog = catalogWith([{ id: 'a', path: 'Images/logo.png', hash: 'h1' }])
    await rescanProject(catalog, disk({}), options())
    const folder = disk({ 'refs/one.png': 'x', 'refs/two.png': 'y' })

    await rescanProject(catalog, folder, options())

    expect(folder.hashed).toEqual([])
  })

  it('reports how far along it is, and what the total is', async () => {
    const catalog = catalogWith([{ id: 'a', path: 'Images/dusk.png', hash: 'h1' }])
    const onProgress = vi.fn()

    await rescanProject(catalog, disk({ 'one.png': 'x', 'two.png': 'y' }), options({ onProgress }))

    expect(onProgress.mock.calls.map(([progress]) => progress)).toEqual([
      { done: 0, total: 2 },
      { done: 2, total: 2 },
    ])
  })
})
