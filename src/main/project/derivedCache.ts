import { mkdir, readdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { orElse } from '@shared/promises'
import {
  DERIVED_STORES,
  DERIVED_STORE_FOLDERS,
  derivedBytesOf,
  type DerivedCacheReport,
  type DerivedStore,
  type DerivedStoreMeasure,
} from '@shared/domain/derivedCache'
import { boundedPool, type BoundedPool } from '@main/boundedPool'

export type DerivedCacheDeps = {
  projectPath: () => string | null
  /** Forgets `proxy_path` and `peaks_path`, and answers how many rows held one. */
  clearDerivedPaths: () => Promise<number>
  /** Bounded like every other walk this process runs — CLAUDE.md § 6. */
  concurrency: () => number
}

export type DerivedCache = {
  /** What the four stores hold right now. Reads nothing but sizes; writes nothing at all. */
  measure: () => Promise<DerivedCacheReport>
  /**
   * Throws the four stores away and tells the catalogue they have gone.
   *
   * Answers what it ACTUALLY freed, measured before the removal rather than promised from an
   * earlier reading: a surface that announces a figure it took a minute ago announces a figure
   * that was true then.
   */
  purge: () => Promise<DerivedCacheReport>
}

const EMPTY: DerivedCacheReport = { stores: [], bytes: 0, clearedRows: 0 }

async function measureStore(
  root: string,
  store: DerivedStore,
  pool: BoundedPool,
): Promise<DerivedStoreMeasure> {
  const folder = join(root, DERIVED_STORE_FOLDERS[store])
  // Relative names rather than dirents: `recursive` gives paths from the folder either way, and
  // a missing store is an empty one — the project creates all four, a copied project may not.
  const names = await orElse(readdir(folder, { recursive: true }), [])
  const held = await Promise.all(
    names.map(name => pool.run(() => orElse(stat(join(folder, name)), null))),
  )
  const bytes = held.reduce((total, one) => total + (one?.isFile() ? one.size : 0), 0)
  const files = held.filter(one => one?.isFile() === true).length
  return { store, files, bytes }
}

/**
 * The derived stores of the open project, measured and — on a named command — thrown away.
 *
 * Never a folder outside the four: what is not here either cannot be rebuilt (`catalog.db` holds
 * the prompt, the seed and the lineage; a poster may be the one a person chose) or is not
 * derived at all. That list lives in `@shared/domain/derivedCache`, where the surface reads it.
 */
export function createDerivedCache(deps: DerivedCacheDeps): DerivedCache {
  const pool = boundedPool(deps.concurrency)

  const measureAll = async (root: string): Promise<DerivedStoreMeasure[]> =>
    await Promise.all(DERIVED_STORES.map(store => measureStore(root, store, pool)))

  return {
    measure: async () => {
      const root = deps.projectPath()
      if (!root) return EMPTY
      const stores = await measureAll(root)
      return { stores, bytes: derivedBytesOf(stores), clearedRows: 0 }
    },

    purge: async () => {
      const root = deps.projectPath()
      if (!root) return EMPTY

      // Measured first: once the folders are gone there is nothing left to count, and the whole
      // point of the answer is to say what the disk gave back.
      const stores = await measureAll(root)

      // Emptied and put back, rather than left gone: ffmpeg writes a proxy by path and creates
      // no folder on the way, so a store that disappeared would cost every later derivation.
      // `.index/` itself is never touched, which is what keeps its hidden flag on Windows.
      for (const store of DERIVED_STORES) {
        const folder = join(root, DERIVED_STORE_FOLDERS[store])
        await rm(folder, { recursive: true, force: true })
        await mkdir(folder, { recursive: true })
      }

      /**
       * Told AFTER the removal, never before: a row cleared while its proxy is still there
       * leaves a file nothing names and nothing will ever collect. The other order leaves, at
       * worst, a row naming a file that went — which is what this line repairs.
       *
       * Only `proxies` and `peaks` are written into a row; the two others are looked up by
       * content and by nothing else, so one call covers everything the catalogue points at.
       */
      const clearedRows = await deps.clearDerivedPaths()
      return { stores, bytes: derivedBytesOf(stores), clearedRows }
    },
  }
}
