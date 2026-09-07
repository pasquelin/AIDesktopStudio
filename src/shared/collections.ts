/**
 * The list cut into runs of at most `size`, in order. An empty input gives NO batch rather than
 * one empty batch: callers send a request per batch, and an empty one would ask for nothing.
 *
 * Shared because both sides batch — the main against the endpoint's body limits, the window
 * against the channel's.
 */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size < 1) throw new Error('chunk size must be at least 1')

  const batches: T[][] = []
  for (let start = 0; start < items.length; start += size) {
    batches.push(items.slice(start, start + size))
  }
  return batches
}

/**
 * Whether two lists name the same things in the same order — the identity guard a store or a hook
 * needs before replacing what it holds with an answer equal to it. Four copies had been written.
 */
export function sameOrder<T>(one: readonly T[], other: readonly T[]): boolean {
  if (one.length !== other.length) return false
  // Indexed rather than `every`: a callback allocates a closure per call, and this runs once per
  // instanced bucket of a rebuild — 2 080 of them on 5 000 bodies over 40 shapes.
  for (let at = 0; at < one.length; at += 1) if (one[at] !== other[at]) return false
  return true
}
