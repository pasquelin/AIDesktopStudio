/**
 * `typeof null === 'object'`, so a bare `typeof value === 'object'` hands `null` through. Every
 * store rehydrating persisted state needs this narrowing, and each one writing it by hand is how
 * two of them ended up letting `null` reach zustand's merge.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * The code inside a rejection that crossed the IPC boundary, or nothing when none of them is.
 *
 * 🛑 Matched at the END, never compared whole: `ipcMain.handle` wraps what it rethrows — `Error
 * invoking remote method 'project:create': Error: holds-projects` — so an equality test never
 * fires and every failure reads as unexpected.
 */
export const codeIn = <T extends string>(message: string, codes: readonly T[]): T | null =>
  codes.find(code => message === code || message.endsWith(`: ${code}`)) ?? null

/**
 * What a rejection says, whatever was thrown. A thrown string is as ordinary as a thrown
 * `Error` — a worker that dies, a loader that gives up — and both sides of the boundary need
 * the same answer for the same throw.
 *
 * The message, never the stack: the trace of a rejected loader points into three.js's own
 * microtasks and names nothing the caller does not already know, while carrying kilobytes.
 */
export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * The same record under renamed keys, for a blob read back from storage whose keys have since
 * been renamed away. Two persisted shapes migrate this way, one per side of the boundary.
 */
export function mapKeys(
  held: Record<string, unknown>,
  rename: (key: string) => string,
): Record<string, unknown> {
  return Object.fromEntries(Object.entries(held).map(([key, value]) => [rename(key), value]))
}

/**
 * The same object without the keys whose value is `undefined`.
 *
 * For building a record out of columns that may be null, where `{ width: undefined }` and `{}`
 * must not be told apart: an asset read back from the catalogue is compared against the one
 * that was written, and a key present with no value fails that comparison while meaning the
 * same thing. Spreading this beats a run of `if (x !== undefined)` once a shape has twenty
 * optional fields.
 */
export function defined<T extends object>(fields: T): Partial<T> {
  const kept: Partial<T> = {}
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) Object.assign(kept, { [key]: value })
  }
  return kept
}

/**
 * Reading one field off something that came back from disk or from a store. Three readers
 * rather than a generic merge: a document written by an older build must open on the current
 * default, and the field is the only place that knows which default that is.
 *
 * `NaN` and `Infinity` are refused as numbers: `JSON.stringify` writes both as `null`, so a
 * file holding one was already unreadable by the time it was written.
 */
export function readNumber(source: Record<string, unknown>, key: string, fallback: number): number {
  const value = source[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export function readString(source: Record<string, unknown>, key: string, fallback: string): string {
  const value = source[key]
  return typeof value === 'string' ? value : fallback
}

/**
 * A field held as WORDS, or nothing — blank counts as nothing.
 *
 * Distinct from `readString`, which answers a fallback: a caller that has to tell « absent » from
 * « empty » wrote `readString(…, '').trim() === '' ? null : readString(…, '')`, reading the same
 * key twice. Both sides of the boundary ask, which is why it lives here.
 */
export function readText(source: Record<string, unknown>, key: string): string | null {
  const value = source[key]
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

/** A number held as a number, or nothing — where `readNumber` answers a fallback. */
export function readOptionalNumber(
  source: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = source[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/**
 * A number that cannot be negative — a length, an intensity, a point in time. Twelve call sites
 * across four engines wrote `Math.max(0, readNumber(…))` before this existed.
 */
export function readPositive(
  source: Record<string, unknown>,
  key: string,
  fallback: number,
): number {
  return Math.max(0, readNumber(source, key, fallback))
}

export function readBoolean(
  source: Record<string, unknown>,
  key: string,
  fallback: boolean,
): boolean {
  const value = source[key]
  return typeof value === 'boolean' ? value : fallback
}

/**
 * A stored value narrowed back to one of a union's members, or the default it does not name.
 *
 * The list rather than the key, unlike the readers above: a union is read off a payload, off an
 * argument and off a menu row, and only the first of those has a record to name a key in.
 */
export function oneOf<T extends string | number>(
  options: readonly T[],
  value: unknown,
  fallback: T,
): T {
  return options.find(candidate => candidate === value) ?? fallback
}
