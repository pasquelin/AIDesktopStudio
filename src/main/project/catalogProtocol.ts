import type { ActivityDraft, ActivityEntry, ActivityQuery } from '@shared/domain/activity'
import type { Asset, AssetCounts, AssetQuery } from '@shared/domain/asset'
import type { CopyGroup } from '@shared/domain/fileCopies'
import type { RescanReport } from './catalogRescan'
import type { AnimationPosterWrite, FiledAsset } from './catalogTypes'

/**
 * What the main process and the catalogue worker say to each other.
 *
 * The catalogue itself is untouched and synchronous — it simply runs on the other side of this
 * protocol now, because `better-sqlite3` blocks the thread it runs on and the main thread owns
 * every window (CLAUDE.md, invariant 6).
 */

export type CatalogRequest =
  | ({ id: number; op: 'setAnimationPoster' } & AnimationPosterWrite)
  | { id: number; op: 'add'; asset: Asset }
  | { id: number; op: 'find'; assetId: string }
  | { id: number; op: 'findByHash'; hash: string }
  | { id: number; op: 'findByRemoteId'; remoteAssetId: string }
  | { id: number; op: 'copies'; hash?: string }
  | { id: number; op: 'clearDerivedPaths' }
  | { id: number; op: 'filed' }
  | { id: number; op: 'search'; query: AssetQuery }
  | { id: number; op: 'countByType' }
  | { id: number; op: 'remove'; assetId: string }
  | { id: number; op: 'repath'; from: string; to: string }
  | { id: number; op: 'forgetUnder'; path: string }
  | { id: number; op: 'assetsUnder'; folders: readonly string[] }
  | { id: number; op: 'appendActivity'; entries: readonly ActivityDraft[] }
  | { id: number; op: 'readActivity'; query: ActivityQuery }

/** What each operation answers, so the client can type its promise without a cast. */
export type CatalogResults = {
  setAnimationPoster: boolean
  add: Asset
  find: Asset | null
  findByHash: Asset | null
  findByRemoteId: Asset | null
  copies: CopyGroup[]
  clearDerivedPaths: number
  filed: FiledAsset[]
  search: Asset[]
  countByType: AssetCounts
  remove: void
  repath: void
  forgetUnder: number
  assetsUnder: Asset[]
  appendActivity: ActivityEntry[]
  readActivity: ActivityEntry[]
}

export type CatalogOp = CatalogRequest['op']

/**
 * Not a request: it answers nothing, and the id it names is one already sent.
 *
 * A `better-sqlite3` query cannot be interrupted once it has begun — what this buys is the ones
 * that have NOT begun. Six keystrokes queue six searches behind one that is running; five of
 * them describe a word nobody is looking for any more by the time their turn comes.
 */
export type CatalogAbandon = { op: 'abandon'; target: number }

/**
 * Reconcile the catalogue with the disk. Its own message rather than a `CatalogRequest`, and it
 * has to be: a request is answered by ONE value dispatched synchronously, where this walks a
 * folder, reads files, and reports how far along it is while it does.
 *
 * `root` travels with it. The thread holds a database file, never a project — and the folder it
 * would have to reconcile with is not something a database can be asked for.
 */
export type CatalogRescan = { id: number; op: 'rescan'; root: string }

/**
 * Stops a rescan by id.
 *
 * NOT `CatalogAbandon`, for three reasons of which each would do: an abandon only saves what is
 * still queued and interrupts nothing begun, it is handled on the client side so the worker
 * never learns of it, and a rescan is precisely the operation that CAN be interrupted — between
 * two batches, which is why the stop has to reach the thread.
 */
export type CatalogRescanStop = { op: 'rescan-stop'; target: number }

/**
 * How far a rescan has got. Not a response: a response settles the request, and this is sent
 * many times before the one that does.
 *
 * `rescanProgress` carries the id AND tells the two apart, and it is named that rather than
 * `rescan` for a measured reason: the finished ANSWER carries a `rescan` field too, so a guard
 * reading that name answered true for both — the progress path swallowed the answer and the
 * promise never settled. The row saying the studio was working stayed on screen for good.
 */
export type CatalogRescanProgress = { rescanProgress: number; done: number; total: number }

export function isRescanProgress(message: unknown): message is CatalogRescanProgress {
  return typeof message === 'object' && message !== null && 'rescanProgress' in message
}

/** What the QUEUE takes: one request at a time, and the abandons that spare the ones still in it. */
export type CatalogQueueMessage = CatalogRequest | CatalogAbandon

/** Everything the thread receives. A rescan runs beside the queue rather than in it. */
export type CatalogMessage = CatalogQueueMessage | CatalogRescan | CatalogRescanStop

export function isAbandon(message: CatalogQueueMessage): message is CatalogAbandon {
  return message.op === 'abandon'
}

export function isRescan(message: CatalogMessage): message is CatalogRescan {
  return message.op === 'rescan'
}

export function isRescanStop(message: CatalogMessage): message is CatalogRescanStop {
  return message.op === 'rescan-stop'
}

/** Everything the queue serves, told from what runs beside it. */
export function isQueueMessage(message: CatalogMessage): message is CatalogQueueMessage {
  return !isRescan(message) && !isRescanStop(message)
}

/** What an abandoned request rejects with, so a caller can tell it from a failure. */
export const ABANDONED = 'abandoned'

export type CatalogResponse =
  | { id: number; ok: true; value: CatalogResults[CatalogOp] }
  | { id: number; ok: true; rescan: RescanReport }
  | { id: number; ok: false; error: string }

export function isRescanResponse(
  response: CatalogResponse,
): response is { id: number; ok: true; rescan: RescanReport } {
  return response.ok && 'rescan' in response
}

/** The worker's first message: the database is open, or it never will be. */
export type CatalogReady = { ready: true } | { ready: false; error: string }

export function isCatalogReady(value: unknown): value is CatalogReady {
  return typeof value === 'object' && value !== null && 'ready' in value
}
