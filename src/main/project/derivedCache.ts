import { mkdir, readdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { orElse } from '@shared/promises'
import {
  DERIVED_STORES,
  DERIVED_STORE_FOLDERS,
  derivedBytesOf,
  NO_DERIVED_CACHE,
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
  /**
   * Whether the media pipeline is deriving right now.
   *
   * 🛑 The purge refuses while it is. `derive` writes `proxy_path` when ffmpeg RETURNS, so a
   * removal landing between the write on disk and the write in the row leaves a row naming a
   * file that is gone — and nothing repairs it, the row having a path.
   */
  deriving: () => boolean
}

export type DerivedCache = {
  /** What the four stores hold right now. Reads nothing but sizes; writes nothing at all. */
  measure: () => Promise<DerivedCacheReport>
  /**
   * Throws the stores away and tells the catalogue. Answers what it freed, measured just
   * before the removal — an earlier reading would announce a figure that WAS true.
   */
  purge: () => Promise<DerivedCacheReport>
}

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
 * Which folders those are, and why the others are kept, lives in `@shared/domain/derivedCache`.
 */
export function createDerivedCache(deps: DerivedCacheDeps): DerivedCache {
  const pool = boundedPool(deps.concurrency)

  const measureAll = async (root: string): Promise<DerivedStoreMeasure[]> =>
    await Promise.all(DERIVED_STORES.map(store => measureStore(root, store, pool)))

  return {
    measure: async () => {
      const root = deps.projectPath()
      if (!root) return NO_DERIVED_CACHE
      const stores = await measureAll(root)
      return { stores, bytes: derivedBytesOf(stores), clearedRows: 0 }
    },

    purge: async () => {
      const root = deps.projectPath()
      if (!root) return NO_DERIVED_CACHE
      if (deps.deriving()) return { ...NO_DERIVED_CACHE, refused: 'deriving' }

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

      // AFTER the removal, never before: a row cleared while its proxy is still there leaves a
      // file nothing names and nothing will collect. The other order leaves a row to repair.
      const clearedRows = await deps.clearDerivedPaths()
      return { stores, bytes: derivedBytesOf(stores), clearedRows }
    },
  }
}
