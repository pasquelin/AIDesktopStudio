import { isForeignTwin, movedSince } from '@shared/domain/asset'
import type { SyncAction, SyncPlan, SyncPolicy } from '@shared/domain/sync'

/**
 * Deciding what would move, without moving anything.
 *
 * Pure on purpose, and separate from the runner that carries a plan out. Two reasons: a plan can
 * be shown to the user before it costs a single request — "12 to push, 3 to fetch" — and the
 * whole promise that two-way sync is a later *policy* rather than a rewrite rests on this one
 * function being the only place that decides.
 *
 * The studio only ever asks for `push` or `pull` today, both from an explicit selection. The
 * `two-way` policy is written and tested all the same: it is the comparison the three stamps
 * were recorded for, and leaving it out until it is needed is how it ends up being bolted on.
 */

/**
 * What the planner needs to know about one asset — a row of the catalogue, narrowed. Local to
 * the main process: the renderer asks for a plan, it does not assemble one.
 */
export type SyncSide = {
  assetId: string
  /** Whether the project actually holds the bytes. A cloud-only row does not. */
  hasLocalFile: boolean
  remoteAssetId?: string
  /** The project the twin lives in — an API key opens onto exactly one. */
  remoteOwnerId?: string
  remoteUpdatedAt?: string
  /** When the two sides were last reconciled. The baseline both other stamps are read against. */
  remoteSyncedAt?: string
  localChangedAt?: string
}

function pushAction(side: SyncSide): SyncAction {
  if (!side.hasLocalFile) return { kind: 'skip', assetId: side.assetId, reason: 'no-local-file' }
  if (side.remoteAssetId === undefined || movedSince(side.localChangedAt, side.remoteSyncedAt)) {
    return { kind: 'push', assetId: side.assetId }
  }
  return { kind: 'skip', assetId: side.assetId, reason: 'nothing-to-do' }
}

function pullAction(side: SyncSide): SyncAction {
  if (side.remoteAssetId === undefined) {
    return { kind: 'skip', assetId: side.assetId, reason: 'no-twin' }
  }
  if (!side.hasLocalFile || movedSince(side.remoteUpdatedAt, side.remoteSyncedAt)) {
    return { kind: 'pull', assetId: side.assetId, remoteAssetId: side.remoteAssetId }
  }
  return { kind: 'skip', assetId: side.assetId, reason: 'nothing-to-do' }
}

function actionFor(side: SyncSide, policy: SyncPolicy, activeOwnerId: string | null): SyncAction {
  const { assetId, remoteAssetId } = side

  // A twin under another project is not out of date, it is out of reach: the identifier means
  // nothing under this key, and pushing would upload a second copy into the wrong library.
  // Through the same reader the badge uses, so the two can never say different things.
  if (remoteAssetId !== undefined && isForeignTwin(side, activeOwnerId)) {
    return { kind: 'skip', assetId, reason: 'other-account' }
  }

  if (policy === 'push') return pushAction(side)
  if (policy === 'pull') return pullAction(side)

  if (remoteAssetId === undefined) {
    return side.hasLocalFile
      ? { kind: 'push', assetId }
      : { kind: 'skip', assetId, reason: 'no-local-file' }
  }

  if (!side.hasLocalFile) return { kind: 'pull', assetId, remoteAssetId }
  const localMoved = movedSince(side.localChangedAt, side.remoteSyncedAt)
  const remoteMoved = movedSince(side.remoteUpdatedAt, side.remoteSyncedAt)
  if (localMoved && remoteMoved) return { kind: 'conflict', assetId, remoteAssetId }
  if (localMoved) return { kind: 'push', assetId }
  if (remoteMoved) return { kind: 'pull', assetId, remoteAssetId }
  return { kind: 'skip', assetId, reason: 'nothing-to-do' }
}

/**
 * What each asset would do under this policy, and a count per outcome for the confirmation the
 * user sees. Skips are kept rather than filtered out: "nothing happened" is an answer, and one
 * the dialog has to be able to explain.
 */
export function planSync(
  sides: readonly SyncSide[],
  policy: SyncPolicy,
  activeOwnerId: string | null,
): SyncPlan {
  const actions = sides.map(side => actionFor(side, policy, activeOwnerId))
  const summary = { push: 0, pull: 0, conflict: 0, skip: 0 }
  for (const action of actions) summary[action.kind] += 1

  return { actions, summary }
}
