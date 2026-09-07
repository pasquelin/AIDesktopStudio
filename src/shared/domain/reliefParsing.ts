import { isRecord, readString } from '../guards'
import type { ReliefMask } from './reliefOverlay'
import type { PackedReliefChunk, ReliefSculpt } from './reliefPacking'

export function readReliefSculpt(value: unknown): ReliefSculpt | undefined {
  if (!isRecord(value) || !Array.isArray(value.chunks)) return undefined
  return { chunks: value.chunks.flatMap(readPackedChunk) }
}

export function readReliefMask(value: unknown): ReliefMask | undefined {
  if (!isRecord(value) || typeof value.kind !== 'string') return undefined
  if (value.kind === 'painted') {
    const weights = readReliefSculpt(value.weights)
    return weights ? { kind: 'painted', weights } : { kind: 'painted', weights: { chunks: [] } }
  }
  if (value.kind === 'height' || value.kind === 'slope') {
    const min = value.min
    const max = value.max
    if (typeof min !== 'number' || typeof max !== 'number') return undefined
    return { kind: value.kind, min, max }
  }
  return undefined
}

export function readReliefGrain(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) return fallback
  return value
}

function readPackedChunk(value: unknown): readonly PackedReliefChunk[] {
  if (!isRecord(value)) return []
  const column = value.column
  const row = value.row
  const payload = readString(value, 'payload', '')
  if (typeof column !== 'number' || typeof row !== 'number') return []
  if (!Number.isInteger(column) || !Number.isInteger(row) || payload === '') return []
  return [{ column, row, payload }]
}
