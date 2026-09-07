import type { PortWatch, WorkerPort } from './workerPort'

/**
 * One request at a time on a port, the rest waiting their turn.
 *
 * 🛑 An ENVELOPE and not a flag on the port: only the retargeting worker asks for this, and
 * written inside `send` it made the five other ports walk an automaton they never entered. What
 * the port owes is one request out and back; what a caller owes its worker is its own affair.
 *
 * The depth is a REFUSAL, not a bound to grow: a window that has queued that many transfers is
 * one where something upstream is asking faster than anything could answer.
 */
export function serial<T>(
  port: WorkerPort<T>,
  { what, depth }: { what: string; depth: number },
): WorkerPort<T> {
  const queued: (() => void)[] = []
  let active = false

  /** Its turn came, or it was given up before it did — the queue full is a throw, not a turn. */
  const waitTurn = (watch?: PortWatch): Promise<boolean> =>
    new Promise(answer => {
      const take = (): void => answer(true)
      queued.push(take)
      // Given up while it waited: the request never started, so there is nothing to take back.
      watch?.signal?.addEventListener('abort', () => {
        const at = queued.indexOf(take)
        if (at < 0) return
        queued.splice(at, 1)
        answer(false)
      })
    })

  /**
   * 🛑 `port.send` is called SYNCHRONOUSLY on a free port: it posts before it records, and one
   * microtask between the two is a window in which a caller reads a worker nothing was asked of.
   */
  const released = async (work: Promise<T | null>): Promise<T | null> => {
    try {
      return await work
    } finally {
      active = false
      queued.shift()?.()
    }
  }

  const afterTurn = async (
    request: Parameters<WorkerPort<T>['send']>[0],
    watch?: PortWatch,
  ): Promise<T | null> => {
    if (queued.length >= depth) throw new Error(`${what} queue is full`)
    if (!(await waitTurn(watch))) return null
    active = true
    return await released(port.send(request, watch))
  }

  return {
    ...port,
    send: (request, watch) => {
      if (port.isGone() || watch?.signal?.aborted) return Promise.resolve(null)
      if (active) return afterTurn(request, watch)

      active = true
      return released(port.send(request, watch))
    },
  }
}
