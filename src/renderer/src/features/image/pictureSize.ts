import { localizedError } from '@shared/localizedError'
import { assetUrl } from '@shared/domain/asset'
import { lendable } from '@/helpers/lendable'
import type { Size } from '@/engines/core/geometry'

/** How a picture's own dimensions are read. Injected, because jsdom decodes nothing. */
export type PictureMeasure = (url: string) => Promise<Size>

/**
 * The largest document a picture may open as.
 *
 * A surface is document-sized and there is one per layer, so a 12000² photo would ask the GPU
 * for 576 MB before the second layer exists. Capped rather than refused: the picture still
 * opens, at a size the studio can paint on.
 *
 * What then keeps a save off the original is NOT this ceiling read back — a crop is a smaller
 * document too, and refusing one would be an image editor that cannot crop. It is the fidelity
 * `becomeAsset` writes on the document the moment the ceiling bites: `reduced`, which
 * `sourceWriteRefusal` reads before anything is written. A refusal built on the CURRENT size was
 * tried and removed; do not bring it back.
 */
export const MAX_PICTURE_SIDE = 8192

/** The picture's own size, as the browser decodes it. */
function naturalSize(url: string): Promise<Size> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.addEventListener('load', () =>
      resolve({ width: image.naturalWidth, height: image.naturalHeight }),
    )
    image.addEventListener('error', () =>
      reject(localizedError('imageMeasureFailed', { url: url })),
    )
    image.src = url
  })
}

/**
 * How the studio measures a picture, as a port rather than a call.
 *
 * The browser is the implementation, and it is the one thing the suites cannot have: jsdom
 * decodes nothing, so an `Image` there never fires `load` and every measurement would hang.
 * Lent for the length of a case, like the sqlite driver and the seam measurer already are.
 */
const measurer = lendable<PictureMeasure>(naturalSize)

/** Swaps the measurer, and hands back the undo. */
export const lendPictureMeasure = measurer.lend

/** What an asset measures, or `null` when its file will not decode. */
export async function measureAsset(
  assetId: string,
  measure: PictureMeasure = measurer.current(),
): Promise<Size | null> {
  try {
    const size = await measure(assetUrl(assetId))
    return size.width > 0 && size.height > 0 ? size : null
  } catch {
    return null
  }
}

/**
 * The same picture, brought under the ceiling without changing its shape.
 *
 * The ratio is kept because the document IS the picture here: letterboxing it would put bars in
 * the pixels rather than around them.
 */
export function withinCeiling(size: Size, ceiling = MAX_PICTURE_SIDE): Size {
  const longest = Math.max(size.width, size.height)
  if (longest <= ceiling) return size

  const scale = ceiling / longest
  // Never below one pixel: a picture whose short side rounds to zero has no surface to paint on.
  return {
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
  }
}
