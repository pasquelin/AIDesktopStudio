/**
 * The binary glTF container: a header and two chunks, read and written.
 *
 * Both processes read one — the main takes pictures out of a model, the renderer puts a skeleton
 * into one — and a second reader would be free to disagree with the first about what a `.glb` is.
 */

/** `glTF` in ASCII, little-endian — the four bytes every `.glb` opens with. */
const GLB_MAGIC = 0x46546c67
const JSON_CHUNK = 0x4e4f534a
const BIN_CHUNK = 0x004e4942
const HEADER_BYTES = 12
const CHUNK_HEADER_BYTES = 8
const VERSION = 2

export type GlbChunks = {
  json: Uint8Array
  /** Empty for a file that keeps its buffers beside it, which is legal and rare. */
  bin: Uint8Array
  /** Chunks another producer added, kept byte-for-byte when the studio rewrites the container. */
  extra?: readonly GlbChunk[]
}

export type GlbChunk = { kind: number; bytes: Uint8Array }

/** The two chunks a `.glb` is made of, or `null` for bytes that are not one. */
export function glbChunksOf(file: Uint8Array): GlbChunks | null {
  const view = glbView(file)
  if (!view) return null

  let json: Uint8Array | null = null
  let bin: Uint8Array | null = null
  const extra: GlbChunk[] = []

  let offset = HEADER_BYTES
  while (offset + CHUNK_HEADER_BYTES <= file.byteLength) {
    const length = view.getUint32(offset, true)
    const kind = view.getUint32(offset + 4, true)
    const start = offset + CHUNK_HEADER_BYTES
    // A length that overruns the file is a truncated download, not a chunk: stop rather than
    // hand a reader a window onto bytes that are not there.
    if (start + length > file.byteLength) break

    const body = file.subarray(start, start + length)
    if (kind === JSON_CHUNK) json ??= body
    else if (kind === BIN_CHUNK) bin ??= body
    else extra.push({ kind, bytes: body })

    offset = start + length
  }

  return json
    ? { json, bin: bin ?? new Uint8Array(), ...(extra.length > 0 ? { extra } : {}) }
    : null
}

function glbView(file: Uint8Array): DataView | null {
  if (file.byteLength < HEADER_BYTES) return null
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength)
  return view.getUint32(0, true) === GLB_MAGIC ? view : null
}

/**
 * The glTF a JSON chunk describes, or `null` when it does not parse — a container three readers
 * of this repository leave exactly as they found it rather than opening as nothing.
 */
export function glbJson(json: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(json))
  } catch {
    return null
  }
}

/**
 * The file those two chunks make — the exact inverse of the read.
 *
 * 🛑 Each chunk is padded to four bytes, spaces after the JSON and zeroes after the binary, as
 * the specification demands: a reader offsetting into an unpadded buffer reads the wrong floats.
 */
export function glbFrom(chunks: GlbChunks): Uint8Array {
  const json = padded(chunks.json, 0x20)
  const bin = chunks.bin.byteLength > 0 ? padded(chunks.bin, 0) : null
  const extra = (chunks.extra ?? []).map(chunk => ({ ...chunk, bytes: padded(chunk.bytes, 0) }))

  const total =
    HEADER_BYTES +
    CHUNK_HEADER_BYTES +
    json.byteLength +
    (bin ? CHUNK_HEADER_BYTES + bin.byteLength : 0) +
    extra.reduce((sum, chunk) => sum + CHUNK_HEADER_BYTES + chunk.bytes.byteLength, 0)

  const file = new Uint8Array(total)
  const view = new DataView(file.buffer)
  view.setUint32(0, GLB_MAGIC, true)
  view.setUint32(4, VERSION, true)
  view.setUint32(8, total, true)

  view.setUint32(HEADER_BYTES, json.byteLength, true)
  view.setUint32(HEADER_BYTES + 4, JSON_CHUNK, true)
  file.set(json, HEADER_BYTES + CHUNK_HEADER_BYTES)

  if (bin) {
    const at = HEADER_BYTES + CHUNK_HEADER_BYTES + json.byteLength
    view.setUint32(at, bin.byteLength, true)
    view.setUint32(at + 4, BIN_CHUNK, true)
    file.set(bin, at + CHUNK_HEADER_BYTES)
  }

  let at =
    HEADER_BYTES +
    CHUNK_HEADER_BYTES +
    json.byteLength +
    (bin ? CHUNK_HEADER_BYTES + bin.byteLength : 0)
  for (const chunk of extra) {
    view.setUint32(at, chunk.bytes.byteLength, true)
    view.setUint32(at + 4, chunk.kind, true)
    file.set(chunk.bytes, at + CHUNK_HEADER_BYTES)
    at += CHUNK_HEADER_BYTES + chunk.bytes.byteLength
  }

  return file
}

/** The chunk grown to a multiple of four, filled with what its kind pads with. */
function padded(bytes: Uint8Array, fill: number): Uint8Array {
  const over = bytes.byteLength % 4
  if (over === 0) return bytes

  const grown = new Uint8Array(bytes.byteLength + (4 - over)).fill(fill)
  grown.set(bytes)
  return grown
}
