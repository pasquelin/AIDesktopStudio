// SPDX-License-Identifier: MIT

/** One idiom for every buffer of this tree: what a step hands out is never allocated by a step. */
export function pooled<T>(pool: T[], at: number, make: () => T): T {
  const kept = pool[at]
  if (kept) return kept

  const made = make()
  pool.push(made)
  return made
}
