import { create } from 'zustand'
import type { Asset } from '@shared/domain/asset'
import type { SyncOutcome, SyncPlan, SyncPolicy } from '@shared/domain/sync'
import { getBridge } from '@/services/bridge'
import { useAssets } from './assets'

export type CloudState = {
  /** One transfer at a time, so a second click cannot start a second push over the first. */
  busy: boolean
  /**
   * The ids the transfer in flight is moving — library ids while pulling, catalogue ids while
   * pushing, exactly as the call that started it was given.
   *
   * Beside `busy` rather than derived from it, because a shelf has to mark the CELLS that are
   * moving: `busy` says the studio is transferring something, which is not enough to draw a
   * spinner on the one tile the user clicked.
   */
  moving: readonly string[]
  /** What the last push or pull did, kept until the next one starts. */
  outcomes: readonly SyncOutcome[]
  push: (assetIds: readonly string[]) => Promise<void>
  pull: (remoteAssetIds: readonly string[], folder?: string) => Promise<void>
  /**
   * Brings one library asset in and hands back the catalogue row it became.
   *
   * The join is the reason this lives here rather than in each caller: `pull` answers in the
   * library's vocabulary of ids, while everything downstream — opening a document, dropping onto
   * a canvas, dragging onto a timeline — needs the row the import wrote, and the two only meet
   * on `remoteAssetId`. Three callers had to know that; now none does.
   *
   * `null` when the transfer failed, and never a guess: the journal already says why.
   */
  fetchOne: (remoteAssetId: string, folder?: string) => Promise<Asset | null>
  plan: (assetIds: readonly string[], policy: SyncPolicy) => Promise<SyncPlan | null>
  clear: () => void
}

const IDLE: Pick<CloudState, 'busy' | 'moving' | 'outcomes'> = {
  busy: false,
  moving: [],
  outcomes: [],
}

/**
 * How long a transfer keeps being SHOWN, however quick it turned out to be.
 *
 * Measured on 13 August 2026, end to end — signed URL then download: a 45 Ko picture arrives in
 * 197 to 446 ms, a 6.8 MB mesh in 2143 ms. The mesh needs no help; the picture went from "in the
 * library" to "here" with nothing legible in between, and the mark meant to say it was coming
 * never lasted long enough to be read.
 *
 * A floor on the SIGN, never on the work: `busy` drops the moment the transfer ends, so the next
 * one can start immediately and nothing waits on this.
 */
const SIGN_MS = 600

/**
 * Which transfer the sign on screen belongs to.
 *
 * A counter rather than a timer handle: a second transfer started while the first is still
 * showing must keep ITS ids marked, and a lone `clearTimeout` would have the older one wipe the
 * newer one's mark on its way out.
 */
let showing = 0

/** Clears the mark once it has been up long enough — and only if no newer transfer owns it. */
function holdSign(set: (state: Partial<CloudState>) => void, token: number, started: number): void {
  const clear = (): void => {
    if (token === showing) set({ moving: [] })
  }

  const left = SIGN_MS - (Date.now() - started)
  if (left > 0) setTimeout(clear, left)
  else clear()
}

/**
 * A transfer, whichever way it goes.
 *
 * The two directions differ by one call and by which vocabulary of ids they speak; everything
 * else — the refusal to start a second one, the mark, the per-asset failures, the stale
 * catalogue afterwards — was written twice, comment for comment.
 */
async function transfer(
  set: (state: Partial<CloudState>) => void,
  get: () => CloudState,
  ids: readonly string[],
  run: (ids: readonly string[]) => Promise<readonly SyncOutcome[] | null>,
): Promise<void> {
  if (get().busy || ids.length === 0) return

  const token = ++showing
  const started = Date.now()
  set({ busy: true, moving: [...ids], outcomes: [] })

  try {
    const outcomes = await run(ids)
    // `null` is no bridge at all, which is not a refusal to report per asset.
    if (outcomes) set({ outcomes })
  } catch {
    // Reaching here means the boundary itself refused — a bad selection, or no project. What
    // failed per asset comes back in `outcomes`, not as a rejection.
    set({ outcomes: ids.map(assetId => ({ assetId, ok: false })) })
  } finally {
    // `busy` goes now, the mark goes later: nothing may wait on a delay that exists only to
    // be seen.
    set({ busy: false })
    holdSign(set, token, started)
    // The rows carry their new sync state and their twin: what is on screen is now stale.
    useAssets.getState().invalidate()
  }
}

/** Runs an errand against the bridge, or answers `null` when there is none. */
async function bridged(
  errand: (bridge: NonNullable<ReturnType<typeof getBridge>>) => Promise<SyncOutcome[]>,
): Promise<SyncOutcome[] | null> {
  const bridge = getBridge()
  return bridge ? await errand(bridge) : null
}

/**
 * Moving assets between the project and the library, on request and never on its own.
 *
 * Deliberately the whole of the studio's sync policy: everything here starts with a click. The
 * planner underneath knows how to compute a two-way diff, and nothing calls it — see spec § 5,
 * which trades an automatic engine for two actions one can point at.
 */
export const useCloud = create<CloudState>()((set, get) => ({
  ...IDLE,

  push: assetIds => transfer(set, get, assetIds, ids => bridged(bridge => bridge.cloud.push(ids))),

  pull: (remoteAssetIds, folder) =>
    transfer(set, get, remoteAssetIds, ids => bridged(bridge => bridge.cloud.pull(ids, folder))),

  fetchOne: async (remoteAssetId, folder) => {
    await get().pull([remoteAssetId], folder)

    // The transfer ended on an `invalidate`, which ARMS a coalesced read; reading now without
    // disarming it sends a second `assets.searchProjectCatalogue` — a synchronous SQLite query in the main
    // process — right behind the one just awaited, on every double-click and every drop.
    useAssets.getState().cancelInvalidate()
    // Read back rather than assumed: the row the import wrote is not in `items` until a read
    // has actually run.
    await useAssets.getState().refresh()

    return useAssets.getState().items.find(item => item.remoteAssetId === remoteAssetId) ?? null
  },

  plan: async (assetIds, policy) => {
    const bridge = getBridge()
    if (!bridge || assetIds.length === 0) return null

    return await bridge.cloud.plan(assetIds, policy)
  },

  clear: () => set(IDLE),
}))

/** How many of the last run went wrong — what a summary line reports without listing them. */
export function failedCount(state: Pick<CloudState, 'outcomes'>): number {
  return state.outcomes.filter(outcome => !outcome.ok).length
}
