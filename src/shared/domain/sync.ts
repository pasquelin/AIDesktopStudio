/**
 * What moving an asset between the project and the library looks like, as both sides describe it.
 *
 * Here rather than beside the planner that computes it: a plan is shown to the user before it is
 * carried out, so it crosses the IPC boundary and both sides must name it the same way.
 */

export type SyncPolicy = 'push' | 'pull' | 'two-way'

/** The values, beside the type: the boundary parses against them with `z.enum`. */
export const SYNC_POLICIES: readonly SyncPolicy[] = ['push', 'pull', 'two-way']

type SkipReason =
  /** The twin belongs to a project this key does not open onto. */
  | 'other-account'
  /** Nothing to send: there are no bytes here. */
  | 'no-local-file'
  /** Nothing to fetch: this asset has no twin. */
  | 'no-twin'
  | 'nothing-to-do'

export type SyncAction =
  | { kind: 'push'; assetId: string }
  | { kind: 'pull'; assetId: string; remoteAssetId: string }
  /** Both sides moved since they last agreed. Reported, never resolved on the user's behalf. */
  | { kind: 'conflict'; assetId: string; remoteAssetId: string }
  | { kind: 'skip'; assetId: string; reason: SkipReason }

export type SyncPlan = {
  actions: SyncAction[]
  /** What the confirmation shows: « 12 to send, 3 to fetch », before anything is spent. */
  summary: Record<SyncAction['kind'], number>
}

/**
 * What one asset actually did. Failures travel beside successes rather than throwing: a push of
 * forty assets where one is refused is thirty-nine that went up, and a rejected promise would
 * hide them all.
 */
export type SyncOutcome = {
  assetId: string
  ok: boolean
  /** The reduced failure code, never a raw API message — those carry the request, hence the key. */
  error?: string
}
