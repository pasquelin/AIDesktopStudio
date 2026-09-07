/**
 * The head of a GGUF file, read against the format's own specification.
 *
 * What it is FOR: a person points at a weights file they already hold, and the studio has to say
 * what it is without asking them to type it — ADR-20 § B, rank 3. Everything the manifest needs
 * beyond this comes from the file system, not from a question.
 *
 * Pure, and on bytes rather than on a path: the caller reads a window of the file and hands it
 * over, so nothing here opens anything and the whole of it is testable from a literal.
 */

/** `GGUF`, little-endian, as the specification writes it. */
export const GGUF_MAGIC = 0x46554747

/**
 * Version 1 sized its strings and arrays with 32-bit lengths; every version since uses 64. Refused
 * rather than supported: llama.cpp dropped it in 2023, and a wrong width reads the file as noise.
 */
const OLDEST_SUPPORTED_VERSION = 2

/**
 * The three metadata value types this reads by number — checked against `GgufValueType` in
 * `node-llama-cpp`, which is the parser the studio actually loads with.
 */
const STRING_TYPE = 8
const ARRAY_TYPE = 9
const UINT32_TYPE = 4
const UINT64_TYPE = 10

/** Bytes each fixed-width type takes, by its number. `-1` for the two that carry their own length. */
const WIDTHS: readonly number[] = [1, 1, 2, 2, 4, 4, 4, 1, -1, -1, 8, 8, 8]

export type GgufHeader = {
  readonly version: number
  /** `qwen2`, `llama`, `phi3` — what names the per-architecture keys below. */
  readonly architecture: string | null
  /** `general.name`, which is what the publisher calls it. Data, never a word of the interface. */
  readonly name: string | null
  /** `<architecture>.context_length`, the window the weights were trained for. */
  readonly contextLength: number | null
}

/**
 * What a window of the file amounts to.
 *
 * `truncated` is not a failure: the metadata block of a large model runs past any first read, and
 * the caller answers it by reading further rather than by giving up.
 */
export type GgufReading =
  | { readonly kind: 'header'; readonly header: GgufHeader }
  | { readonly kind: 'truncated' }
  | { readonly kind: 'not-gguf' }

const DECODER = new TextDecoder()

/** Thrown and caught within this module alone: it is how a walk past the window unwinds. */
class Truncated extends Error {}

class Cursor {
  private at = 0

  constructor(
    private readonly view: DataView,
    private readonly bytes: Uint8Array,
  ) {}

  private take(length: number): number {
    const from = this.at
    if (from + length > this.bytes.byteLength) throw new Truncated()

    this.at += length
    return from
  }

  uint32(): number {
    return this.view.getUint32(this.take(4), true)
  }

  /** Refused above `Number.MAX_SAFE_INTEGER`: a length that large is a file being read wrong. */
  uint64(): number {
    const value = this.view.getBigUint64(this.take(8), true)
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Truncated()

    return Number(value)
  }

  string(): string {
    const length = this.uint64()
    const from = this.take(length)
    return DECODER.decode(this.bytes.subarray(from, from + length))
  }

  /** Steps over a value of a type nothing here reads, whatever its shape. */
  skip(type: number): void {
    if (type === STRING_TYPE) {
      this.take(this.uint64())
      return
    }

    if (type === ARRAY_TYPE) {
      const inner = this.uint32()
      const count = this.uint64()
      for (let index = 0; index < count; index += 1) this.skip(inner)
      return
    }

    const width = WIDTHS[type]
    // An unknown type ends the walk: the widths that follow it cannot be trusted, and guessing
    // would read the rest of the metadata as noise.
    if (width === undefined || width < 0) throw new Truncated()

    this.take(width)
  }
}

/** One number, whatever width the file wrote it in. `null` for a value that is not a number. */
function numberValue(cursor: Cursor, type: number): number | null {
  if (type === STRING_TYPE || type === ARRAY_TYPE) {
    cursor.skip(type)
    return null
  }

  if (type === UINT32_TYPE) return cursor.uint32()
  if (type === UINT64_TYPE) return cursor.uint64()

  cursor.skip(type)
  return null
}

function metadataOf(cursor: Cursor, count: number) {
  let architecture: string | null = null
  let name: string | null = null
  const lengths = new Map<string, number>()
  for (let index = 0; index < count; index += 1) {
    const key = cursor.string()
    const type = cursor.uint32()
    if (type === STRING_TYPE && key === 'general.architecture') architecture = cursor.string()
    else if (type === STRING_TYPE && key === 'general.name') name = cursor.string()
    else if (key.endsWith('.context_length')) {
      const length = numberValue(cursor, type)
      if (length !== null) lengths.set(key, length)
    } else cursor.skip(type)
  }
  return { architecture, name, lengths }
}

export function ggufHeaderOf(bytes: Uint8Array): GgufReading {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (bytes.byteLength < 8 || view.getUint32(0, true) !== GGUF_MAGIC) return { kind: 'not-gguf' }

  const cursor = new Cursor(view, bytes)

  try {
    cursor.uint32()
    const version = cursor.uint32()
    if (version < OLDEST_SUPPORTED_VERSION) return { kind: 'not-gguf' }

    cursor.uint64()
    const count = cursor.uint64()

    const { architecture, name, lengths } = metadataOf(cursor, count)

    return {
      kind: 'header',
      header: {
        version,
        architecture,
        name,
        // The architecture's own window, and never another's: a file may declare several, and the
        // one that governs is the one named after what the file says it is.
        contextLength: lengths.get(`${architecture ?? ''}.context_length`) ?? null,
      },
    }
  } catch (error) {
    if (error instanceof Truncated) return { kind: 'truncated' }
    throw error
  }
}
