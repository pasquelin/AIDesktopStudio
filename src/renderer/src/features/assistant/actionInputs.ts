import { isRecord, readBoolean } from '@shared/guards'

/**
 * Reading an action's input, after `validatesInput` has agreed it fits the registry. The checks
 * are therefore narrowing rather than guarding, and they stay total: a handler that threw here
 * would cross the boundary as a bare `badInput` and tell the client nothing.
 */

/** The same reader both sides of the boundary use — named here for the handlers that call it. */
export { readText as textOf } from '@shared/guards'

export function numberOf(input: Record<string, unknown>, key: string): number | null {
  const value = input[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * One number composed with what the studio HOLDS, which is what `relative` names: ADDED for a
 * position or a rotation, MULTIPLIED for a scale or a dial — « de moitié » and « de 20 % » mean
 * a factor, and nobody says either additively.
 *
 * `how` is PASSED, never read off the key: the same rule was spelt out at four sites with three
 * different tests, one of them a `startsWith('scale')` that would catch a future `scaleMode`.
 */
export function composedNumber(
  held: number,
  given: number | null,
  relative: boolean,
  how: 'add' | 'multiply',
): number {
  if (given === null) return held
  if (!relative) return given

  return how === 'multiply' ? held * given : held + given
}

export function boolOf(input: Record<string, unknown>, key: string): boolean {
  return readBoolean(input, key, false)
}

/**
 * The same, telling « false » apart from « not named » — which `boolOf` cannot, and which every
 * partial write needs: a call naming the size of a ground must not put the ground out.
 *
 * Its own reader rather than the pair `input.x === undefined ? … : boolOf(input, 'x')`, which was
 * spelt out at seventeen sites and names the key twice — a typo on either half is a field the
 * registry declares and the handler silently drops.
 */
export function maybeBoolOf(input: Record<string, unknown>, key: string): boolean | null {
  return input[key] === undefined ? null : readBoolean(input, key, false)
}

/** One optional flag of a partial write, or nothing — the difference `boolOf` cannot carry. */
export function flagNamed(input: Record<string, unknown>, key: string): Record<string, boolean> {
  const value = maybeBoolOf(input, key)
  return value === null ? {} : { [key]: value }
}

/** A closed set, read by value. Numbers as well as words: `1 | 2 | 4` is a choice like any other. */
export function oneOf<T extends string | number>(
  input: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
): T | null {
  const value = input[key]
  return allowed.find(candidate => candidate === value) ?? null
}

export function recordOf(
  input: Record<string, unknown>,
  key: string,
): Record<string, unknown> | null {
  const value = input[key]
  return isRecord(value) ? value : null
}

/** A list of strings, empty rather than null: every caller treats "none given" as "none". */
export function textsOf(input: Record<string, unknown>, key: string): string[] {
  const value = input[key]
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

/**
 * What a WRITE answers: the fields of `held` the call named, as they now stand, and only those —
 * see `movedOf` for the measure behind it. The whole object is many times the room there is.
 */
export function namedOf<T extends object>(input: Record<string, unknown>, held: T): Partial<T> {
  // `Object.fromEntries` widens to `Record<string, unknown>`; the keys come from `held` itself.
  return Object.fromEntries(
    Object.entries(held).filter(([key]) => input[key] !== undefined),
  ) as Partial<T>
}

/** The same for a field COMPOSED of several: `positionX` names `position`, `roughnessMin` a range. */
export function composedNamedOf<T extends object, K extends keyof T & string>(
  input: Record<string, unknown>,
  held: T,
  keys: readonly K[],
  suffixes: readonly string[],
  stemOf: (key: K) => string = key => key,
): Partial<T> {
  // Same widening as `namedOf`.
  return Object.fromEntries(
    keys
      .filter(key => suffixes.some(suffix => input[`${stemOf(key)}${suffix}`] !== undefined))
      .map((key): [string, unknown] => [key, held[key]]),
  ) as Partial<T>
}
