import { getBridge } from '@/services/bridge'
import { reportFailure } from '@/services/diagnostics'
import { useAssets } from '@/stores/assets'

/**
 * Brings a durable internal resource out into the explorer — §6.7, T7.
 *
 * The main process MOVES the file and repaths its row, so the project weighs the same afterwards
 * and every document that cites it goes on drawing it: they cite an identity, never a path.
 */
export async function showInternalResource(assetId: string): Promise<void> {
  try {
    await getBridge()?.assets.showResource(assetId)
    await useAssets.getState().refresh()
  } catch (error) {
    reportFailure('assets.reveal', assetId, error)
  }
}
