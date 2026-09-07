import { bytesFromBase64, bytesToBase64 } from '../base64'
import type { ReliefChunkKey } from './reliefMetrics'

/** One chunk's deltas as the file holds them: base64 of sparse or dense float32, never JSON floats. */
export type PackedReliefChunk = ReliefChunkKey & { payload: string }

export type ReliefSculpt = {
  chunks: readonly PackedReliefChunk[]
}

const SPARSE = 0
const DENSE = 1

export function packDeltas(deltas: Float32Array): string {
  let nonzero = 0
  for (let at = 0; at < deltas.length; at++) if (deltas[at] !== 0) nonzero += 1
  if (nonzero === 0) return ''
  return bytesToBase64(
    nonzero * 8 + 5 <= deltas.byteLength + 1 ? sparseOf(deltas, nonzero) : denseOf(deltas),
  )
}

export function unpackDeltas(payload: string, length: number): Float32Array {
  const out = new Float32Array(length)
  if (payload === '') return out
  const bytes = bytesFromBase64(payload)
  if (bytes.length < 1) return out
  if (bytes[0] === DENSE) {
    const body = bytes.subarray(1)
    const count = Math.min(length, Math.floor(body.byteLength / 4))
    const aligned = new Float32Array(count)
    new Uint8Array(aligned.buffer).set(body.subarray(0, count * 4))
    out.set(aligned)
    return out
  }
  if (bytes[0] !== SPARSE || bytes.length < 5) return out
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const count = view.getUint32(1, true)
  for (let at = 0; at < count; at++) {
    const cursor = 5 + at * 8
    if (cursor + 8 > bytes.length) break
    const index = view.getUint32(cursor, true)
    if (index < length) out[index] = view.getFloat32(cursor + 4, true)
  }
  return out
}

function sparseOf(deltas: Float32Array, nonzero: number): Uint8Array {
  const out = new Uint8Array(5 + nonzero * 8)
  const view = new DataView(out.buffer)
  out[0] = SPARSE
  view.setUint32(1, nonzero, true)
  let cursor = 5
  for (let at = 0; at < deltas.length; at++) {
    const delta = deltas[at]
    if (delta === 0 || delta === undefined) continue
    view.setUint32(cursor, at, true)
    view.setFloat32(cursor + 4, delta, true)
    cursor += 8
  }
  return out
}

function denseOf(deltas: Float32Array): Uint8Array {
  const out = new Uint8Array(1 + deltas.byteLength)
  out[0] = DENSE
  out.set(new Uint8Array(deltas.buffer, deltas.byteOffset, deltas.byteLength), 1)
  return out
}

export function payloadsOf(sculpt: ReliefSculpt | undefined): Map<string, PackedReliefChunk> {
  return new Map((sculpt?.chunks ?? []).map(chunk => [`${chunk.column}:${chunk.row}`, chunk]))
}
