import { exportedBytes } from './exportedResponse'
import { uploadMimeTypeOf } from '@shared/domain/assetMime'

export type ExpandedAssets = {
  files: Readonly<Record<string, string>>
  dispose: () => void
}

/**
 * 🛑 Overlapped, and the bytes handed to the `Blob` as they came: `Uint8Array.from` on a typed
 * array walks the iterator protocol byte by byte, which on a 20 MB texture is hundreds of
 * milliseconds spent copying what `exportedBytes` already returns.
 */
export async function expandCompressedAssets(
  files: Readonly<Record<string, string>>,
  compressed: readonly string[],
): Promise<ExpandedAssets> {
  const urls: string[] = []
  try {
    const fetched = await Promise.all(
      compressed.map(async id => {
        const file = files[id]
        if (!file) return null
        return { id, file, bytes: await exportedBytes(file, 'gzip') }
      }),
    )
    const expanded = { ...files }
    for (const one of fetched) {
      if (!one) continue
      // `as`: fflate hands back a view on a plain `ArrayBuffer`, and `BlobPart` refuses the
      // `SharedArrayBuffer` half of `ArrayBufferLike` that a gunzip never returns.
      const url = URL.createObjectURL(
        new Blob([one.bytes as Uint8Array<ArrayBuffer>], {
          type: uploadMimeTypeOf(one.file.endsWith('.gz') ? one.file.slice(0, -3) : one.file) ?? '',
        }),
      )
      expanded[one.id] = url
      urls.push(url)
    }
    return { files: expanded, dispose: () => urls.forEach(url => URL.revokeObjectURL(url)) }
  } catch (error) {
    urls.forEach(url => URL.revokeObjectURL(url))
    throw error
  }
}
