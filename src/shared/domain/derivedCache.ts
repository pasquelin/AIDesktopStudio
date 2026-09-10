import { FILMSTRIPS_FOLDER, PEAKS_FOLDER, PROXIES_FOLDER, THUMBNAILS_FOLDER } from './project'

/**
 * The derived stores a named command may throw away — and only those.
 *
 * 🛑 `POSTERS_FOLDER` is deliberately absent, and the reason is measured rather than cautious:
 * a still is either the one the library sent down with a generation, which no local tool can
 * make again, or the frame a person picked by hand (`setAnimationPoster`, `replace`). Neither
 * is regenerable, so neither is a cache — see the three stores in the file specification.
 *
 * `.index/` holds three more things that are NOT here for the same reason: `catalog.db` carries
 * the prompt, the seed and the lineage, none of which is on the disk anywhere else; the memory
 * index and the pending-files journal are mid-flight state, not derived bytes.
 */
export type DerivedStore = 'thumbnails' | 'filmstrips' | 'proxies' | 'peaks'

export const DERIVED_STORES: readonly DerivedStore[] = [
  'thumbnails',
  'filmstrips',
  'proxies',
  'peaks',
]

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
}

export function derivedBytesOf(stores: readonly DerivedStoreMeasure[]): number {
  return stores.reduce((total, one) => total + one.bytes, 0)
}
