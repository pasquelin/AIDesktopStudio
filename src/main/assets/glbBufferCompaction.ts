import { isRecord } from '@shared/guards'

export function compactBufferViews(
  gltf: Record<string, unknown>,
  binary: Uint8Array,
  removed: ReadonlySet<number>,
): Uint8Array {
  if (!Array.isArray(gltf.bufferViews) || removed.size === 0) return binary
  if (gltf.bufferViews.some(hasMeshoptCompression)) {
    return compactMeshoptBufferViews(gltf, binary, removed)
  }

  const remap = new Map<number, number>()
  const kept: unknown[] = []
  const pieces: Uint8Array[] = []
  let length = 0
  gltf.bufferViews.forEach((view, index) => {
    if (removed.has(index)) return
    remap.set(index, kept.length)
    if (!isRecord(view) || (view.buffer !== undefined && view.buffer !== 0)) {
      kept.push(view)
      return
    }
    const offset = typeof view.byteOffset === 'number' ? view.byteOffset : 0
    const size = typeof view.byteLength === 'number' ? view.byteLength : 0
    const bytes = binary.subarray(offset, offset + size)
    const padding = (4 - (length % 4)) % 4
    if (padding > 0) pieces.push(new Uint8Array(padding))
    length += padding
    view.byteOffset = length
    pieces.push(bytes)
    length += bytes.byteLength
    kept.push(view)
  })
  gltf.bufferViews = kept
  remapBufferViews(gltf, remap)
  return joined(gltf, pieces, length)
}

function compactMeshoptBufferViews(
  gltf: Record<string, unknown>,
  binary: Uint8Array,
  removed: ReadonlySet<number>,
): Uint8Array {
  const views = Array.isArray(gltf.bufferViews) ? gltf.bufferViews : []
  const ranges = [...removed]
    .flatMap(index => rangeOf(views[index], binary.byteLength))
    .sort((left, right) => left.start - right.start)
  if (ranges.length === 0) return binary

  const remap = retainedIndexes(views, removed)
  const kept = views.filter((_, index) => !removed.has(index))
  for (const view of kept) shiftBufferOffsets(view, ranges)
  gltf.bufferViews = kept
  remapBufferViews(gltf, remap)

  const pieces: Uint8Array[] = []
  let cursor = 0
  for (const range of ranges) {
    if (range.start > cursor) pieces.push(binary.subarray(cursor, range.start))
    cursor = Math.max(cursor, range.end)
  }
  if (cursor < binary.byteLength) pieces.push(binary.subarray(cursor))
  return joined(
    gltf,
    pieces,
    pieces.reduce((sum, piece) => sum + piece.byteLength, 0),
  )
}

function rangeOf(value: unknown, binaryLength: number): { start: number; end: number }[] {
  if (!isRecord(value) || (value.buffer !== undefined && value.buffer !== 0)) return []
  const start = typeof value.byteOffset === 'number' ? value.byteOffset : 0
  const length = typeof value.byteLength === 'number' ? value.byteLength : 0
  const end = start + length
  return [{ start, end: Math.min(binaryLength, end + ((4 - (end % 4)) % 4)) }]
}

function retainedIndexes(values: readonly unknown[], removed: ReadonlySet<number>) {
  const remap = new Map<number, number>()
  let next = 0
  values.forEach((_, index) => {
    if (!removed.has(index)) remap.set(index, next++)
  })
  return remap
}

function joined(gltf: Record<string, unknown>, pieces: readonly Uint8Array[], length: number) {
  const result = new Uint8Array(length)
  let offset = 0
  for (const piece of pieces) {
    result.set(piece, offset)
    offset += piece.byteLength
  }
  const buffers = Array.isArray(gltf.buffers) ? gltf.buffers : []
  if (isRecord(buffers[0])) buffers[0].byteLength = result.byteLength
  return result
}

function shiftBufferOffsets(
  view: unknown,
  ranges: readonly { start: number; end: number }[],
): void {
  if (!isRecord(view)) return
  if (typeof view.byteOffset === 'number') view.byteOffset = shiftedOffset(view.byteOffset, ranges)
  const meshopt = isRecord(view.extensions) ? view.extensions.EXT_meshopt_compression : undefined
  if (isRecord(meshopt) && typeof meshopt.byteOffset === 'number') {
    meshopt.byteOffset = shiftedOffset(meshopt.byteOffset, ranges)
  }
}

function shiftedOffset(offset: number, ranges: readonly { start: number; end: number }[]): number {
  let removed = 0
  let cursor = 0
  for (const range of ranges) {
    if (range.end > offset) break
    const start = Math.max(cursor, range.start)
    if (range.end > start) removed += range.end - start
    cursor = Math.max(cursor, range.end)
  }
  return offset - removed
}

function hasMeshoptCompression(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.extensions)) return false
  return isRecord(value.extensions.EXT_meshopt_compression)
}

function remapBufferViews(value: unknown, remap: ReadonlyMap<number, number>): void {
  if (Array.isArray(value)) {
    for (const child of value) remapBufferViews(child, remap)
    return
  }
  if (!isRecord(value)) return
  for (const [key, child] of Object.entries(value)) {
    if (key === 'bufferView' && typeof child === 'number') {
      const index = remap.get(child)
      if (index !== undefined) value[key] = index
    } else remapBufferViews(child, remap)
  }
}
