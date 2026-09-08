import { localizedError } from '@shared/localizedError'
import { reportFailure } from '@/services/diagnostics'
import { canvasOf, canvasStore, useCanvases } from '@/stores/canvases'

/**
 * Whether the document still measures what the asset it edits measures.
 *
 * Measured rather than remembered: the picture is already decoded by the layer drawing it, so
 * the browser answers from its cache, and a size carried on the descriptor would be one more
 * field to persist and one more that could drift from the pixels.
 *
 * `null` — not `false` — when the answer cannot be had: an asset that will not measure, or a
 * document holding no canvas yet. Neither is a mismatch, and reporting one as such would put a
 * toast in front of every save made while the engine boots its GPU context.
 */
export async function matchesAsset(documentId: string, assetId: string): Promise<boolean | null> {
  if (!canvasStore.hasState(useCanvases.getState(), documentId)) return null

  // Through `import()` for the reason `placeAsset` gives: this file is in the opening chunk, and
  // nothing measures a picture until a gesture lands on a document that edits one.
  const { measureAsset } = await import('./pictureSize')
  const size = await measureAsset(assetId)
  if (!size) return null

  const canvas = canvasOf(useCanvases.getState(), documentId)
  return canvas.width === size.width && canvas.height === size.height
}

/**
 * Says it when a document no longer measures the asset it edits — and says nothing else.
 *
 * NOT a refusal, and the difference is the whole decision: a crop is an edit like any other, so
 * a save that declined a resized document would be an image editor that cannot crop. That was
 * tried, and it refused five saves in a row before being removed.
 *
 * What it replaces is the SILENCE that removal left behind. ⌘S overwrites the asset's file at
 * the document's size, and `replaceBytes` deletes what it replaces — so a document that drifted
 * without anyone meaning it to shrinks the original with nothing said. It happened: a
 * 4112 × 2658 photo opened into a 1024² document was written back over itself at 1024².
 *
 * Said at both moments it can still be acted on — reopening the tab, and the save itself.
 *
 * The name is passed rather than the asset: one caller holds the shelf row and the other holds
 * only what ⌘S was given, and the id and the name are all either of them needs to say it.
 */
export async function reportAssetDrift(
  documentId: string,
  assetId: string,
  name: string,
): Promise<void> {
  if ((await matchesAsset(documentId, assetId)) === false) {
    // `canvas.size` rather than `assets.save`, which is where this used to land and where it was
    // false at both call sites: at ⌘S the asset IS rewritten — the save happens either way — and
    // on a revisit nothing is saved at all. Both moments say the same thing as the two warnings
    // in `placeAsset`: the document does not measure its picture, and ⌘S writes that size back.
    reportFailure('canvas.size', name, localizedError('assetSizeMismatch'))
  }
}
