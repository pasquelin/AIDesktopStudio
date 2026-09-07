import { glbChunksOf, glbFrom, glbJson } from '@shared/domain/glbContainer'
import { isRecord } from '@shared/guards'
import type { ExportedAssetOverride } from '@shared/domain/gameExport'

export type EmbeddedTextureTransform = (
  id: string,
  bytes: Uint8Array,
) => Promise<ExportedAssetOverride | null>

/** One live slice of the BIN chunk: where it was read, and where the rewrite puts it back. */
type BinRange = {
  view: Record<string, unknown>
  offset: number
  length: number
  replacement: Uint8Array | null
  at: number
}

export async function optimizedGlbTextures(
  assetId: string,
  file: Uint8Array,
  transform: EmbeddedTextureTransform,
): Promise<ExportedAssetOverride | null> {
  const chunks = glbChunksOf(file)
  if (!chunks) return null
  const document = glbJson(chunks.json)
  if (!isRecord(document)) return null
  const ranges = binRangesOf(Array.isArray(document.bufferViews) ? document.bufferViews : [])
  const images = Array.isArray(document.images) ? document.images : []
  if (!(await reducedEmbeddedImages(assetId, images, ranges, chunks.bin, transform))) return null

  const bin = recomposedBin(chunks.bin, [...ranges.values()])
  const buffers = Array.isArray(document.buffers) ? document.buffers : []
  if (isRecord(buffers[0])) Reflect.set(buffers[0], 'byteLength', bin.byteLength)
  return {
    id: assetId,
    bytes: glbFrom({ json: new TextEncoder().encode(JSON.stringify(document)), bin }),
    extension: 'glb',
  }
}

async function reducedEmbeddedImages(
  assetId: string,
  images: readonly unknown[],
  ranges: ReadonlyMap<number, BinRange>,
  binary: Uint8Array,
  transform: EmbeddedTextureTransform,
): Promise<boolean> {
  let reduced = 0
  for (const [imageIndex, image] of images.entries()) {
    if (!isRecord(image) || typeof image.bufferView !== 'number') continue
    const range = ranges.get(image.bufferView)
    if (!range || range.replacement) continue
    const source = binary.slice(range.offset, range.offset + range.length)
    const optimized = await transform(`${assetId}:${imageIndex}`, source)
    if (!optimized) continue
    range.replacement = optimized.bytes
    Reflect.set(image, 'mimeType', optimized.extension === 'jpg' ? 'image/jpeg' : 'image/png')
    reduced += 1
  }
  return reduced > 0
}

function binRangesOf(views: readonly unknown[]): Map<number, BinRange> {
  const ranges = new Map<number, BinRange>()
  for (const [index, view] of views.entries()) {
    if (!isRecord(view)) continue
    if (view.buffer !== undefined && view.buffer !== 0) continue
    if (typeof view.byteLength !== 'number') continue
    ranges.set(index, {
      view,
      offset: typeof view.byteOffset === 'number' ? view.byteOffset : 0,
      length: view.byteLength,
      replacement: null,
      at: 0,
    })
  }
  return ranges
}

// 🛑 Rebuilt from its live ranges alone, four-byte aligned as accessors require: appending the
// reduced images instead left every original in the file, unreferenced — `quarter` grew a
// texture-heavy model to ~1,05x its input rather than shrinking it to ~0,25x.
function recomposedBin(source: Uint8Array, ranges: readonly BinRange[]): Uint8Array {
  const ordered = [...ranges].sort((one, other) => one.offset - other.offset)
  let total = 0
  for (const range of ordered) {
    total += (4 - (total % 4)) % 4
    range.at = total
    total += range.replacement?.byteLength ?? range.length
  }

  const bin = new Uint8Array(total)
  for (const range of ordered) {
    bin.set(
      range.replacement ?? source.subarray(range.offset, range.offset + range.length),
      range.at,
    )
    Reflect.set(range.view, 'byteOffset', range.at)
    Reflect.set(range.view, 'byteLength', range.replacement?.byteLength ?? range.length)
  }
  return bin
}
