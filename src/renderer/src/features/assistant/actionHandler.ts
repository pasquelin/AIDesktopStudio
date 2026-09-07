import type { Asset } from '@shared/domain/asset'
import { refused, type ActionName, type ActionOutcome } from '@shared/domain/assistant'
import type { StudioBridge } from '@shared/ipc'
import { getBridge } from '@/services/bridge'
import type { WireCall } from './wireConsent'

/**
 * What one action does, once `validatesInput` has agreed its input fits the registry.
 *
 * A handler may therefore read its input plainly. What it may not assume is meaning: an id that
 * parses is still an id of something that may be gone, which is why every handler answers a
 * refusal rather than throwing.
 */
export type ActionHandler = (
  input: Record<string, unknown>,
  /**
   * Where the call came from, which one handler needs and the rest ignore: `studio.batch` runs
   * calls of its own, and they engage on the terms of the door the LOT came through.
   */
  wire?: WireCall,
  signal?: AbortSignal,
) => ActionOutcome | Promise<ActionOutcome>

/**
 * One family's share of the table, assembled in `executor.ts`. `executor.test.ts` holds the whole
 * to the registry in both directions — an action published with nothing behind it would answer
 * `badInput` to every client that read `tools/list` and believed it.
 */
export type ActionHandlers = Partial<Record<ActionName, ActionHandler>>

/**
 * Runs against the bridge, or refuses for the one reason a window can have none.
 *
 * The guard was written out at twenty-two call sites before this existed, which is twenty-two
 * chances to answer `ok` on a call that never left the window.
 */
export async function withBridge(
  run: (bridge: StudioBridge) => Promise<unknown>,
): Promise<ActionOutcome> {
  const bridge = getBridge()
  if (!bridge) return refused('noBridge', 'this window is not connected to the studio process')

  return { ok: true, data: await run(bridge) }
}

/**
 * Runs against one catalogue row, or refuses for an id the library does not hold.
 *
 * Every family that takes an `assetId` and does something WITH the asset — rather than merely
 * naming it — needs the row itself: its length, its size, whether it has a local file at all.
 */
export async function withAsset(
  assetId: string,
  run: (asset: Asset) => ActionOutcome,
): Promise<ActionOutcome> {
  const found = await withBridge(bridge => bridge.assets.search({ ids: [assetId], limit: 1 }))
  if (!found.ok) return found

  const asset = Array.isArray(found.data) ? found.data[0] : undefined
  return asset
    ? run(asset)
    : refused(
        'notFound',
        `no asset "${assetId}" in this library — assets.searchProjectCatalogue answers what it holds, each with its id`,
      )
}

/** `ok`, with what the call answers read AFTER the command — a bare `ok` when it answers nothing. */
export function answered<S>(
  answer: ((state: S) => unknown) | undefined,
  read: () => S,
): ActionOutcome {
  return answer ? { ok: true, data: answer(read()) } : { ok: true }
}
