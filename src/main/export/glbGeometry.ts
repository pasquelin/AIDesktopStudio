import { glbChunksOf, glbFrom, glbJson } from '@shared/domain/glbContainer'

const GLB_VERSION = 2
const HEADER_BYTES = 12
const CHUNK_HEADER_BYTES = 8
const UNSIGNED_SHORT = 5123
const UNSIGNED_INT = 5125
const ELEMENT_ARRAY_BUFFER = 34963

type JsonObject = Record<string, unknown>

type CompactView = {
  offset: number
  length: number
  count: number
  accessor: JsonObject
  view: JsonObject
}

/** What the candidates before each one drop, and what they all drop, in their sorted order. */
type RemovedBytes = { before: readonly number[]; total: number }

/** Both edges of every bufferView, each list sorted: two searches count what a range meets. */
type ViewBounds = { offsets: readonly number[]; ends: readonly number[] }

export function compactGlbGeometry(source: Uint8Array): Uint8Array {
  const parsed = parsedGlb(source)
  if (!parsed) return source
  const candidates = compactViewsOf(parsed.json, parsed.binary)
  if (candidates.length === 0) return source

  const removed = removedBytesOf(candidates)
  const binary = compactBinary(parsed.binary, candidates, removed.total)
  updateOffsets(parsed.json, candidates, removed)
  const result = glbFrom({
    json: new TextEncoder().encode(JSON.stringify(parsed.json)),
    bin: binary,
  })
  return result.byteLength < source.byteLength ? result : source
}

function parsedGlb(source: Uint8Array): { json: JsonObject; binary: Uint8Array } | null {
  if (source.byteLength < HEADER_BYTES + CHUNK_HEADER_BYTES) return null
  const header = new DataView(source.buffer, source.byteOffset, source.byteLength)
  if (header.getUint32(4, true) !== GLB_VERSION) return null

  const chunks = glbChunksOf(source)
  if (!chunks || chunks.bin.byteLength === 0) return null
  // The rewrite recomposes the file from these two chunks alone: a third chunk, or bytes past
  // them, would be dropped without a word, so refuse anything the two do not account for.
  const accounted =
    HEADER_BYTES + 2 * CHUNK_HEADER_BYTES + chunks.json.byteLength + chunks.bin.byteLength
  if (accounted !== source.byteLength) return null

  const decoded = glbJson(chunks.json)
  return isObject(decoded) ? { json: decoded, binary: chunks.bin } : null
}

/** The index buffers that fit in uint16, sorted by where they sit in the binary chunk. */
function compactViewsOf(json: JsonObject, binary: Uint8Array): CompactView[] {
  const accessors = objectArray(json.accessors)
  const views = objectArray(json.bufferViews)
  const buffers = objectArray(json.buffers)
  if (!accessors || !views || buffers?.length !== 1 || buffers[0]?.uri !== undefined) return []
  const references = new Map<number, number>()
  for (const accessor of accessors) {
    const view = integer(accessor.bufferView)
    if (view !== null) references.set(view, (references.get(view) ?? 0) + 1)
  }
  const found = accessors.flatMap(accessor => {
    const candidate = compactViewOf(accessor, views, binary, references)
    return candidate ? [candidate] : []
  })
  if (found.length === 0) return found

  const bounds = viewBoundsOf(views)
  return found.some(candidate => aliased(bounds, candidate))
    ? []
    : found.sort((left, right) => left.offset - right.offset)
}

function compactViewOf(
  accessor: JsonObject,
  views: readonly JsonObject[],
  binary: Uint8Array,
  references: ReadonlyMap<number, number>,
): CompactView | null {
  const index = integer(accessor.bufferView)
  const count = integer(accessor.count)
  if (index === null || count === null || !isCompactAccessor(accessor, index, references))
    return null
  const view = views[index]
  if (!isCompactIndexView(view)) return null
  const offset = integer(view.byteOffset) ?? 0
  const length = integer(view.byteLength)
  if (length !== count * 4 || !fitsUnsignedShort(binary, offset, length, count)) return null
  return { offset, length, count, accessor, view }
}

function isCompactAccessor(
  accessor: JsonObject,
  index: number,
  references: ReadonlyMap<number, number>,
): boolean {
  return (
    accessor.componentType === UNSIGNED_INT &&
    accessor.type === 'SCALAR' &&
    accessor.byteOffset === undefined &&
    accessor.sparse === undefined &&
    accessor.extensions === undefined &&
    references.get(index) === 1
  )
}

function isCompactIndexView(view: JsonObject | undefined): view is JsonObject {
  return (
    view !== undefined &&
    (view.buffer === undefined || view.buffer === 0) &&
    view.target === ELEMENT_ARRAY_BUFFER &&
    view.extensions === undefined &&
    view.byteStride === undefined
  )
}

function fitsUnsignedShort(
  binary: Uint8Array,
  offset: number,
  length: number,
  count: number,
): boolean {
  if (offset + length > binary.byteLength) return false
  const values = new DataView(binary.buffer, binary.byteOffset + offset, length)
  for (let item = 0; item < count; item += 1) {
    if (values.getUint32(item * 4, true) > 65_535) return false
  }
  return true
}

function viewBoundsOf(views: readonly JsonObject[]): ViewBounds {
  const offsets: number[] = []
  const ends: number[] = []
  for (const view of views) {
    const length = integer(view.byteLength)
    if (length === null) continue
    const offset = integer(view.byteOffset) ?? 0
    offsets.push(offset)
    ends.push(offset + length)
  }
  return { offsets: offsets.sort(ascending), ends: ends.sort(ascending) }
}

/** Whether a second bufferView reads bytes this candidate is about to rewrite. */
function aliased(bounds: ViewBounds, candidate: CompactView): boolean {
  const met =
    countBelow(bounds.offsets, candidate.offset + candidate.length) -
    countBelow(bounds.ends, candidate.offset + 1)
  // Its own view is one of them, unless the accessor is empty and so meets nothing at all.
  return met > (candidate.length > 0 ? 1 : 0)
}

/** How many of an ascending list fall strictly under a bound. */
function countBelow(sorted: readonly number[], bound: number): number {
  let low = 0
  let high = sorted.length
  while (low < high) {
    const middle = (low + high) >> 1
    const at = sorted[middle]
    if (at !== undefined && at < bound) low = middle + 1
    else high = middle
  }
  return low
}

function removedBytesOf(candidates: readonly CompactView[]): RemovedBytes {
  const before: number[] = []
  let total = 0
  for (const candidate of candidates) {
    before.push(total)
    total += candidate.length - alignedLength(candidate.count * 2)
  }
  return { before, total }
}

function compactBinary(
  binary: Uint8Array,
  candidates: readonly CompactView[],
  removed: number,
): Uint8Array {
  const result = new Uint8Array(binary.byteLength - removed)
  let sourceOffset = 0
  let targetOffset = 0
  for (const candidate of candidates) {
    const before = binary.subarray(sourceOffset, candidate.offset)
    result.set(before, targetOffset)
    targetOffset += before.byteLength
    const sourceValues = new DataView(
      binary.buffer,
      binary.byteOffset + candidate.offset,
      candidate.length,
    )
    const compactLength = candidate.count * 2
    const targetValues = new DataView(result.buffer, targetOffset, compactLength)
    for (let item = 0; item < candidate.count; item += 1) {
      targetValues.setUint16(item * 2, sourceValues.getUint32(item * 4, true), true)
    }
    targetOffset += alignedLength(compactLength)
    sourceOffset = candidate.offset + candidate.length
  }
  result.set(binary.subarray(sourceOffset), targetOffset)
  return result
}

function updateOffsets(
  json: JsonObject,
  candidates: readonly CompactView[],
  removed: RemovedBytes,
): void {
  for (const candidate of candidates) {
    candidate.accessor.componentType = UNSIGNED_SHORT
    candidate.view.byteLength = candidate.count * 2
  }
  const starts = candidates.map(candidate => candidate.offset)
  for (const view of objectArray(json.bufferViews) ?? []) {
    const offset = integer(view.byteOffset) ?? 0
    // `before` stops at the last candidate: a view sitting past them all has lost every byte.
    const dropped = removed.before[countBelow(starts, offset)] ?? removed.total
    if (offset > 0 || dropped > 0) view.byteOffset = offset - dropped
  }
  const buffers = objectArray(json.buffers)
  const first = buffers?.[0]
  if (first) {
    const length = integer(first.byteLength)
    if (length !== null) first.byteLength = length - removed.total
  }
}

function alignedLength(length: number): number {
  return Math.ceil(length / 4) * 4
}

const ascending = (left: number, right: number): number => left - right

function objectArray(value: unknown): JsonObject[] | null {
  return Array.isArray(value) && value.every(isObject) ? value : null
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function integer(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null
}
