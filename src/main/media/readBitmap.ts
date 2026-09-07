import { nativeImage } from 'electron'
import { readFile } from 'node:fs/promises'

/**
 * The pixels of a picture file, as the four BGRA bytes Chromium hands back, and `null` for what
 * it declines to decode — `createFromBuffer` answers an EMPTY image rather than throwing.
 *
 * Read first, then decode, for the reason `renderThumbnail` gives: `createFromPath` blocks the
 * main thread on the disk as well as on the decoder.
 */
export async function readBitmap(file: string): Promise<Uint8Array | null> {
  const image = nativeImage.createFromBuffer(await readFile(file))
  return image.isEmpty() ? null : image.toBitmap()
}
