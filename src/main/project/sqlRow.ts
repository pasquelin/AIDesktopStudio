import type { SqlRow } from './sqlite'

/**
 * Reading one column of a row, for the two catalogues that hold one.
 *
 * The port answers `string | number | bigint | Uint8Array | null | undefined` for every column,
 * because that is what SQLite may hand back — an integer column comes back as a `bigint` on one
 * driver and a `number` on the other. Callers narrow here rather than assuming, once.
 */

export function text(row: SqlRow, column: string): string {
  const value = row[column]
  return typeof value === 'string' ? value : ''
}

export function optionalText(row: SqlRow, column: string): string | undefined {
  const value = row[column]
  return typeof value === 'string' ? value : undefined
}

export function optionalNumber(row: SqlRow, column: string): number | undefined {
  const value = row[column]
  if (typeof value === 'number') return value
  return typeof value === 'bigint' ? Number(value) : undefined
}

export function number(row: SqlRow, column: string): number {
  return optionalNumber(row, column) ?? 0
}

/**
 * A blob column, as bytes. Empty for anything else — a caller reading a vector out of a row that
 * holds none gets a vector of no dimensions, which is what an absent embedding already is.
 */
export function bytes(row: SqlRow, column: string): Uint8Array {
  const value = row[column]
  return ArrayBuffer.isView(value)
    ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
    : new Uint8Array()
}
