export type CancelRegistry = {
  start: (id: number) => void
  cancel: (id: number) => void
  /** Whether the request was cancelled, consuming the answer: a loop asks between two slices. */
  stopped: (id: number) => boolean
  finish: (id: number) => void
}

/**
 * What a worker was asked to drop. A cancel that lost the race against `done` names a request
 * that is already over: recorded, it would sit in the set for the life of the worker.
 */
export function createCancelRegistry(): CancelRegistry {
  const running = new Set<number>()
  const cancelled = new Set<number>()
  return {
    start: id => {
      running.add(id)
    },
    cancel: id => {
      if (running.has(id)) cancelled.add(id)
    },
    stopped: id => cancelled.delete(id),
    finish: id => {
      running.delete(id)
      cancelled.delete(id)
    },
  }
}
