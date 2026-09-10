import {
  FILMSTRIPS_FOLDER,
  INDEX_FOLDER,
  PEAKS_FOLDER,
  POSTERS_FOLDER,
  PROXIES_FOLDER,
  THUMBNAILS_FOLDER,
} from './project'

/**
 * The derived stores a named command may throw away — and only those. What it leaves, and why,
 * is `KEPT_MACHINE_FOLDERS`; the guard holds the two together against `MACHINE_FOLDERS`.
 */
export type DerivedStore = 'thumbnails' | 'filmstrips' | 'proxies' | 'peaks'

export const DERIVED_STORES: readonly DerivedStore[] = [
  'thumbnails',
  'filmstrips',
  'proxies',
  'peaks',
]

/**
 * The machine folders a purge deliberately LEAVES, each with the reason it is not a cache.
 *
 * Its point is the guard beside it: `MACHINE_FOLDERS` and the two lists here must cover one
 * another exactly, so a folder cannot join the machine set without someone deciding, in the
 * same breath, whether throwing it away costs anything.
 */
export const KEPT_MACHINE_FOLDERS: Record<string, string> = {
  // A still is either the one the library sent down with a generation or the frame a person
  // picked by hand (`setAnimationPoster`, `replace`). Neither can be made again.
  [POSTERS_FOLDER]: 'a still is chosen or delivered, never derived',
  // `catalog.db` carries the prompt, the seed and the lineage, none of which is on the disk
  // anywhere else; the memory index and the pending-files journal are work in flight.
  [INDEX_FOLDER]: 'holds the only copy of what no file records',
}

/** Where each store lives, project-relative. The ONE spelling, taken from the folders. */
export const DERIVED_STORE_FOLDERS: Record<DerivedStore, string> = {
  thumbnails: THUMBNAILS_FOLDER,
  filmstrips: FILMSTRIPS_FOLDER,
  proxies: PROXIES_FOLDER,
  peaks: PEAKS_FOLDER,
}

export type DerivedStoreMeasure = {
  store: DerivedStore
  files: number
  bytes: number
}

/**
 * What the derived stores hold, or what a purge actually gave back.
 *
 * One shape for both because the question is the same one asked before and after, and two
 * shapes is how a surface ends up announcing a figure the purge never reported.
 */
export type DerivedCacheReport = {
  stores: readonly DerivedStoreMeasure[]
  bytes: number
  /**
   * Catalogue rows whose `proxy_path` and `peaks_path` were cleared. `0` on a measurement:
   * nothing was cleared because nothing was thrown away.
   */
  clearedRows: number
  /**
   * Set when the purge DID NOT RUN because the pipeline was still deriving.
   *
   * 🛑 Its own field rather than a zero: a purge that freed nothing and a purge that never
   * happened read the same on the surface, and the second one has to be tried again.
   */
  refused?: 'deriving'
}

/** Nothing held and nothing freed — what every reader answers with when there is no project. */
export const NO_DERIVED_CACHE: DerivedCacheReport = { stores: [], bytes: 0, clearedRows: 0 }

export function derivedBytesOf(stores: readonly DerivedStoreMeasure[]): number {
  return stores.reduce((total, one) => total + one.bytes, 0)
}
