import type { ActivityDraft, ActivityEntry, ActivityQuery } from '@shared/domain/activity'
import type { Asset, AssetCounts, AssetQuery } from '@shared/domain/asset'
import type { CopyGroup } from '@shared/domain/fileCopies'

/**
 * One filed row, as reconciling with the disk reads it — its path, what identifies its bytes,
 * and when it was last found to be gone.
 *
 * Deliberately not an `Asset`: the rescan compares paths and fingerprints, and carrying the
 * prompt and the generation parameters of every row across a thread for that would be the cost
 * this shape exists to avoid.
 */
export type FiledAsset = {
  /**
   * What the pass writes back by. NOT the path: the pass reads every row, then gives the thread
   * back while it fingerprints, and the queue goes on serving `repath` and `add` in between — a
   * write aimed at a path would land on whichever row occupies it by then, which is how a row
   * whose file is perfectly present gets dated in place of the one that went.
   */
  id: string
  path: string
  hash: string | null
  missingAt: string | null
}

/**
 * One row as the backup keeps it — what a reader would need to recognise a file again if the
 * catalogue itself were gone.
 *
 * The provenance and nothing else: what the file is, what it was called, and what was asked for
 * to make it. Everything derived — the proxy, the waveform, the poster — is rebuildable from the
 * file, and everything about the remote twin belongs to an account rather than to a project.
 */
export type BackedUpItem = {
  hash: string
  id: string
  name: string
  type: string
  path: string
  createdAt: string
  tags: string[]
  prompt?: string
  modelId?: string
  seed?: number
}

/**
 * Filing the still an animation wears. An OBJECT rather than four arguments: three of them are
 * paths, and `sourcePath` and `posterPath` next to each other are two strings nothing tells apart.
 */
export type AnimationPosterWrite = {
  assetId: string
  /** Where the clip is, as the row holds it: the write is refused if it has moved since. */
  sourcePath: string
  posterPath: string
  /** Overwrites a still the clip already has. A person asked; the automatic pass never does. */
  replace?: boolean
}

export type Catalog = {
  setAnimationPoster: (write: AnimationPosterWrite) => boolean
  add: (asset: Asset) => Asset
  find: (assetId: string) => Asset | null
  /** The local asset an API one became, so a generation's parent can be tied to its channels. */
  findByRemoteId: (remoteAssetId: string) => Asset | null
  /** The row holding these exact bytes, if the project already imported them once. */
  findByHash: (hash: string) => Asset | null
  /**
   * Files this project holds MORE THAN ONCE, grouped by fingerprint — G-P's own question, and
   * the one `findByHash` cannot answer: it stops at the first row.
   *
   * `hash` narrows it to one group, which is what a single file's information asks for. Whole,
   * it is a diagnosis, and it is NOT paged: a page of candidates is a page of a question, and
   * the second half would be read as « there are no others ». What bounds it instead is the
   * query — only fingerprints filed at two distinct live paths come back at all.
   */
  copies: (hash?: string) => CopyGroup[]
  /**
   * Forgets every `proxy_path` and `peaks_path`, and answers how many rows lost one.
   *
   * Its own operation because throwing away the derived files and forgetting where they were
   * are one gesture: a row still naming a proxy that went makes playback open nothing at all.
   */
  clearDerivedPaths: () => number
  search: (query: AssetQuery) => Asset[]
  /**
   * How many rows each kind holds. One grouped query rather than six searches: the home draws
   * the six numbers at once, and counting in SQL never carries a row across the thread.
   */
  countByType: () => AssetCounts
  /**
   * Drops a row and the references the catalogue itself holds to it. What lives on disk is the
   * caller's business: the proxy and the waveform are named after a hash that other rows may
   * share, so only the caller knows whether they are still wanted.
   */
  remove: (assetId: string) => void
  /**
   * Follows a file that moved: the row filed at `from` is refiled at `to`, and so is everything
   * beneath it when `from` is a folder. The ids do not change, which is the whole point — a
   * scene referring to a texture keeps referring to it however the user rearranges the project.
   *
   * Idempotent, and that is what makes a replayed journal safe: run twice, the second pass finds
   * nothing at `from` and writes nothing.
   *
   * The caller moves the file FIRST and calls this second. The other order leaves a row pointing
   * at a path nothing is at.
   */
  repath: (from: string, to: string) => void
  /**
   * Dates the row filed at `path`, and every row beneath it, as gone — a folder sent to the
   * trash. Answers how many rows it touched.
   *
   * DATED and not dropped, which is what makes it agree with the rescan rather than fight it:
   * the system trash is reversible, and a row deleted the moment a file went there would leave
   * a restored file with no prompt, no seed and no lineage — the one copy of all three. Dated,
   * the next pass sees the file back where the catalogue says and clears the date, and the
   * whole gesture undoes itself without the studio having to have watched the trash.
   *
   * A folder is not an asset, so no id can say what went; the path is the only handle.
   */
  forgetUnder: (path: string) => number
  /**
   * Every filed row under any of these folders, with NO bound.
   *
   * Apart from `search` because it must not be PAGED: refiling what a move landed under a capped
   * page left the rows past the cap carrying the type of the folder they came from, in silence.
   */
  assetsUnder: (folders: readonly string[]) => Asset[]
  /**
   * Every row that names a file, and only what reconciling the catalogue with the disk reads of
   * one. The whole table at once rather than a query per file: a project of a hundred thousand
   * assets is one statement here and a hundred thousand round trips the other way.
   */
  filed: () => FiledAsset[]
  /**
   * Dates a row as gone, or clears the date when its file is back. BY ID — see `FiledAsset.id`.
   *
   * The row itself is never dropped: it carries the prompt, the seed and the lineage, and none
   * of that is on the disk. A file the user moved outside the studio comes back to its row by
   * fingerprint; one they deleted stays dated.
   */
  markMissing: (assetId: string, at: string | null) => void
  /**
   * Every row that has a file AND a fingerprint, as the backup keeps them.
   *
   * Its own query rather than a `search`: what goes into the backup is a handful of columns, and
   * carrying whole assets — the probe, the generation parameters, the sync stamps — for a file
   * that keeps none of them would be the cost this shape exists to avoid.
   */
  backup: () => BackedUpItem[]
  /**
   * Writes lines to the journal, in one transaction, and trims it back to its bound.
   *
   * A batch rather than one line at a time: a push of two hundred assets writes two hundred
   * lines, and two hundred transactions on a synchronous driver is the sort of thing that shows
   * up as a frozen window.
   */
  appendActivity: (entries: readonly ActivityDraft[]) => ActivityEntry[]
  /** Newest first, which is the order the panel opens on. */
  readActivity: (query: ActivityQuery) => ActivityEntry[]
  close: () => void
}
