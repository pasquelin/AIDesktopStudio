import { mkdtemp, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  PEAKS_FOLDER,
  POSTERS_FOLDER,
  PROXIES_FOLDER,
  THUMBNAILS_FOLDER,
} from '@shared/domain/project'
import { createDerivedCache } from './derivedCache'

const roots: string[] = []

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

/** A project folder with one file in each store the studio writes into. */
async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'derived-'))
  roots.push(root)

  for (const [folder, bytes] of [
    [THUMBNAILS_FOLDER, 10],
    [PROXIES_FOLDER, 200],
    [PEAKS_FOLDER, 30],
    [POSTERS_FOLDER, 500],
  ] as const) {
    await mkdir(join(root, folder), { recursive: true })
    await writeFile(join(root, folder, 'one.bin'), new Uint8Array(bytes))
  }

  return root
}

const cacheOf = (root: string, clearDerivedPaths = vi.fn(async () => 0)) => ({
  cache: createDerivedCache({
    projectPath: () => root,
    clearDerivedPaths,
    concurrency: () => 2,
  }),
  clearDerivedPaths,
})

describe('the rebuildable stores', () => {
  it('measures the four it may free, and not the stills', async () => {
    const root = await project()

    const report = await cacheOf(root).cache.measure()

    expect(report.bytes).toBe(240)
    expect(report.stores.map(one => one.store)).toEqual([
      'thumbnails',
      'filmstrips',
      'proxies',
      'peaks',
    ])
  })

  /**
   * 🛑 A still is either the one the library sent down with a generation or the frame a person
   * picked by hand. Neither is regenerable, so neither is a cache — freeing it would lose a
   * choice, which is exactly what the three stores are named apart to prevent.
   */
  it('leaves the stills where they are', async () => {
    const root = await project()

    await cacheOf(root).cache.purge()

    expect(await readdir(join(root, POSTERS_FOLDER))).toEqual(['one.bin'])
  })

  /**
   * 🛑 Emptied and PUT BACK: ffmpeg writes a proxy by path and creates no folder on the way, so
   * a store left gone would cost every later derivation.
   */
  it('empties each store it frees and leaves the folder standing', async () => {
    const root = await project()

    await cacheOf(root).cache.purge()

    expect(await readdir(join(root, PROXIES_FOLDER))).toEqual([])
    expect((await stat(join(root, PEAKS_FOLDER))).isDirectory()).toBe(true)
  })

  /**
   * 🛑 A row still naming a proxy that went makes playback open nothing at all — and the order
   * matters: the files go first, so a failure can only ever leave a row to repair.
   */
  it('tells the catalogue the derived files have gone, and says what it freed', async () => {
    const root = await project()
    const { cache, clearDerivedPaths } = cacheOf(
      root,
      vi.fn(async () => 7),
    )

    const freed = await cache.purge()

    expect(clearDerivedPaths).toHaveBeenCalledOnce()
    expect(freed).toMatchObject({ bytes: 240, clearedRows: 7 })
  })

  it('answers nothing at all when no project is open', async () => {
    const cache = createDerivedCache({
      projectPath: () => null,
      clearDerivedPaths: vi.fn(async () => 0),
      concurrency: () => 2,
    })

    expect(await cache.measure()).toEqual({ stores: [], bytes: 0, clearedRows: 0 })
  })
})
