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
 * opens, at a size the studio can paint on — and `writeAsset` then declines to overwrite it,
 * because a flatten smaller than the asset is not a replacement for it.
 */
export const MAX_PICTURE_SIDE = 8192

/** The picture's own size, as the browser decodes it. */
export function naturalSize(url: string): Promise<Size> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.addEventListener('load', () =>
      resolve({ width: image.naturalWidth, height: image.naturalHeight }),
    )
    image.addEventListener('error', () => reject(new Error(`could not measure ${url}`)))
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
