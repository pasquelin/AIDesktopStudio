import { createCatalog } from './catalog'
import { rescanProject, type RescanDisk } from './catalogRescan'
import { openMemoryDatabase } from './sqliteMemory'
import type { AsyncCatalog } from './catalogClient'

/**
 * A catalogue with the production shape but no thread: real SQLite, answered as promises.
 *
 * The thread is what `catalogClient` and `catalogDispatch` cover. Everything upstream only
 * cares that the catalogue answers later, so paying for a worker per test would buy nothing.
 */
export function memoryCatalog(file = ':memory:', disk: RescanDisk | null = null): AsyncCatalog {
  const catalog = createCatalog(openMemoryDatabase(file))

  return {
    add: async asset => catalog.add(asset),
    find: async assetId => catalog.find(assetId),
    setAnimationPoster: async write => catalog.setAnimationPoster(write),
    findByHash: async hash => catalog.findByHash(hash),
    findByRemoteId: async remoteAssetId => catalog.findByRemoteId(remoteAssetId),
    copies: async hash => catalog.copies(hash),
    clearDerivedPaths: async () => catalog.clearDerivedPaths(),
    filed: async () => catalog.filed(),
    search: async query => catalog.search(query),
    assetsUnder: async folders => catalog.assetsUnder(folders),
    countByType: async () => catalog.countByType(),
    remove: async assetId => catalog.remove(assetId),
    repath: async (from, to) => catalog.repath(from, to),
    forgetUnder: async path => catalog.forgetUnder(path),

    // No disk unless a test hands one over: everything upstream of the rescan only needs the
    // catalogue to answer, and a pass with nothing to walk would report nothing anyway.
    rescan: async (_root, options) =>
      disk
        ? await rescanProject(catalog, disk, {
            now: () => new Date().toISOString(),
            stopped: () => options?.signal?.aborted === true,
            yieldTo: () => Promise.resolve(),
            onProgress: progress => options?.onProgress?.(progress),
          })
        : { moved: 0, missing: 0, returned: 0, complete: true },

    appendActivity: async entries => catalog.appendActivity(entries),
    readActivity: async query => catalog.readActivity(query),
    close: async () => catalog.close(),
  }
}
