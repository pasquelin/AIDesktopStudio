import { clamp } from '../numeric'

/**
 * Reconciling a stored order with the registry this build declares. The bar of spaces and the
 * home's bands both need it, and both had written it out — the subtle half, where a newcomer
 * belongs, twice.
 *
 * A stored order is a photograph of what existed the day it was written: an entry since dropped
 * would draw a hole, and one since added would be invisible to everyone who had already arranged
 * theirs. So a newcomer lands where the registry declares it — right after the last of its
 * earlier neighbours the reader kept — rather than at the end, and the reason the registry is
 * ordered survives.
 *
 * `kept` is the stored order already cleaned of what this build no longer knows: only the caller
 * can say what a valid entry is, and it is the same pass that drops the malformed ones.
 */
export function reconcileOrder<T, K>(
  kept: readonly T[],
  registry: readonly T[],
  keyOf: (item: T) => K,
): T[] {
  const order = [...kept]

  for (const [index, entry] of registry.entries()) {
    if (order.some(item => keyOf(item) === keyOf(entry))) continue

    let at = 0
    for (const earlier of registry.slice(0, index)) {
      const found = order.findIndex(item => keyOf(item) === keyOf(earlier))
      if (found >= 0) at = found + 1
    }

    order.splice(at, 0, entry)
  }

  return order
}

/**
 * The same list with one entry moved by that many places. Clamped at both ends rather than
 * wrapping: a row dragged past the top has arrived, it has not gone to the bottom.
 *
 * The SAME array back when nothing moved, which is how a caller tells "already at that end" from
 * "it travelled" — a line dragged against the top is asked to move on every step of the gesture,
 * and a fresh array each time rebuilds whatever reads it for nothing.
 */
export function movedWithin(ids: readonly string[], id: string, by: number): readonly string[] {
  const from = ids.indexOf(id)
  if (from === -1 || by === 0) return ids

  const to = clamp(from + by, 0, ids.length - 1)
  if (to === from) return ids

  const moved = [...ids]
  moved.splice(from, 1)
  moved.splice(to, 0, id)
  return moved
}

/**
 * The same items, in the order the ids name. Anything the order forgot keeps its place at the
 * end rather than vanishing: an order is a gesture, and a gesture computed against a stale list
 * must not delete an entry.
 */
export function inOrder<T extends { id: string }>(
  items: readonly T[],
  order: readonly string[],
): T[] {
  const byId = new Map(items.map(one => [one.id, one]))
  const moved = order.flatMap(id => {
    const found = byId.get(id)
    if (found) byId.delete(id)
    return found ? [found] : []
  })
  return [...moved, ...byId.values()]
}
