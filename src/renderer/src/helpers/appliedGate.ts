import { waitUntil } from '@shared/promises'

/**
 * What each mounted engine has been handed, and the wait for one to catch up with its store.
 *
 * 🛑 An edit answers the moment the STORE holds it, and the engine is given that state by an
 * effect one React render later. Everything read off the engine rather than off the store — a
 * still, an optimisation plan, an export — therefore saw the state BEFORE the edit whenever the
 * two calls sat in one lot, whose calls are only a microtask apart.
 *
 * One factory for the two kinds that have an engine: written twice, the image half had already
 * lost its `forget` — so a closed tab kept its whole stack alive, and a wait outlived the
 * viewport it was waiting on.
 */
export type AppliedGate<S> = {
  /** Told by the surface that hands the engine a state — the one place that knows. */
  note: (documentId: string, state: S) => void
  /** Told when the engine goes: nothing will apply now, and anyone waiting is let go. */
  forget: (documentId: string) => void
  /** Settles when the mounted engine holds what the store holds. No clock in it. */
  settled: (documentId: string) => Promise<void>
}

export function createAppliedGate<S>(
  isMounted: (documentId: string) => boolean,
  currentOf: (documentId: string) => S,
): AppliedGate<S> {
  const applied = new Map<string, S>()
  const settling = new Set<() => void>()
  const wakeAll = (): void => {
    for (const wake of settling) wake()
  }
  /**
   * 🛑 An engine that has never noted is not LATE: its content comes from somewhere this gate
   * knows nothing about — a bench port standing in for pixels, a workshop drawing its own scene.
   * Waiting on it would never end, since nothing is ever going to note.
   */
  const caughtUp = (documentId: string): boolean =>
    !isMounted(documentId) ||
    !applied.has(documentId) ||
    applied.get(documentId) === currentOf(documentId)

  return {
    note: (documentId, state) => {
      applied.set(documentId, state)
      wakeAll()
    },
    forget: documentId => {
      applied.delete(documentId)
      wakeAll()
    },
    settled: documentId =>
      waitUntil(
        () => caughtUp(documentId),
        [
          wake => {
            settling.add(wake)
            return () => settling.delete(wake)
          },
        ],
      ),
  }
}
