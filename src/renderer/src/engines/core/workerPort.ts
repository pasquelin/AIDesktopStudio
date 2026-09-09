import { localizedError } from '@shared/localizedError'
/**
 * One worker, the requests out on it, and what happens when it dies.
 *
 * NOT `workerSession`, and not mergeable into it: this shape posts BEFORE it records, answers a
 * request many times, and RESOLVES `null` where that one rejects — three opposites, not gaps.
 */

type PortSlot<T> = {
  resolve: (value: T | null) => void
  reject: (error: Error) => void
  onProgress?: (progress: number) => void
}

/** Many progress reports, then exactly one `done`. A wire union must spell all three arms. */
export type PortResponse =
  | { id: number; done: false; progress: number }
  | { id: number; done: true; ok: true }
  | { id: number; done: true; ok: false; error: string }

type Answered<R> = Extract<R, { done: true; ok: true }>

export type WorkerPort<T> = {
  /** Numbering is the port's, so no caller can hand out one of its own. */
  claim: () => number
  /** Started at the first request, replaced after one dies. */
  running: () => Worker
  /** Let go: a request arriving after that answers `null`. */
  isGone: () => boolean
  /** Recorded AFTER the post, so a payload the clone cannot carry leaves no slot behind. */
  record: (id: number, slot: PortSlot<T>) => void
  /** `false` when the request was already answered for — what tells a late abort from a live one. */
  forget: (id: number) => boolean
  /**
   * One request, out and back: claimed, posted, recorded, and taken back on an abort.
   *
   * 🛑 The order is the contract, not a style — posting BEFORE recording is what leaves no slot
   * behind when the structured clone refuses a payload. Written out three times before this, in
   * three engines, each with the same six comments.
   */
  send: (
    request: (id: number) => { message: unknown; transfer?: Transferable[] },
    watch?: PortWatch,
  ) => Promise<T | null>
  dispose: () => void
}

/** What a caller may follow a request with: how far it has got, and a way to take it back. */
export type PortWatch = {
  onProgress?: (progress: number) => void
  signal?: AbortSignal
}

/**
 * How a request in flight is taken back.
 *
 * 🛑 It belongs to the WORKER, not to the caller: a worker that reads its mailbox between steps
 * answers `{ cancel: true }`, and one whose work is a single call that never yields can only be
 * killed. Written as a flag on `send`, five ports out of six walked an automaton for the sixth.
 */
export type CancelPolicy = 'message' | 'terminate'

/**
 * @param spawn builds the worker on first use and after a recoverable restart.
 * @param what names the worker in the two failures no `try` inside it can catch.
 * @param valueOf extracts the value carried by a completed worker answer.
 * @param cancel how a request out on it is taken back — see `CancelPolicy`.
 */
export function createWorkerPort<T, R extends PortResponse>(
  spawn: () => Worker,
  what: string,
  valueOf: (answer: Answered<R>) => T,
  cancel: CancelPolicy = 'message',
): WorkerPort<T> {
  const waiting = new Map<number, PortSlot<T>>()
  let worker: Worker | null = null
  let gone = false
  let nextId = 0

  const settle = (response: R): void => {
    const slot = waiting.get(response.id)
    if (!slot) return

    if (!response.done) {
      slot.onProgress?.(response.progress)
      return
    }

    waiting.delete(response.id)
    // TypeScript does not narrow a generic by its discriminant, and `done && ok` just held.
    if (response.ok) slot.resolve(valueOf(response as Answered<R>))
    else slot.reject(new Error(response.error))
  }

  const abandon = (dead: Worker, reason: string): void => {
    // A late event from a worker already replaced must not take its successor down with it.
    if (worker !== dead) return

    worker.terminate()
    worker = null
    const abandoned = [...waiting.values()]
    waiting.clear()
    for (const slot of abandoned) slot.reject(new Error(reason))
  }

  /**
   * 🛑 Killing it ABANDONS what was still out on it: a terminated worker answers nothing more,
   * ever, and a slot left in `waiting` is a promise nobody will ever honour. Held safe until now
   * only because the one port that terminates is wrapped by `serial` — an invariant living a
   * file away from the code that needed it.
   */
  const takeBack = (running: Worker, id: number): void => {
    if (cancel === 'message') {
      running.postMessage({ id, cancel: true })
      return
    }
    // 🛑 Killed whatever the port holds NOW: `abandon` leaves alone a worker it no longer owns —
    // one replaced since the post, by an error that respawned it — and that worker would run its
    // request to the end for nobody. Terminated once either way, which its suite counts.
    if (worker === running)
      abandon(running, localizedError('workerCancelled', { name: what }).message)
    else running.terminate()
  }

  const port: WorkerPort<T> = {
    claim: () => (nextId += 1),

    running: () => {
      if (worker) return worker

      const started = spawn()
      started.addEventListener('message', (event: MessageEvent<R>) => {
        if (worker === started) settle(event.data)
      })
      started.addEventListener('error', event =>
        abandon(
          started,
          localizedError('workerFailed', { name: what, reason: event.message }).message,
        ),
      )
      started.addEventListener('messageerror', () =>
        abandon(started, localizedError('workerUnreadable', { name: what }).message),
      )
      worker = started
      return started
    },

    isGone: () => gone,

    record: (id, slot) => void waiting.set(id, slot),

    forget: id => waiting.delete(id),

    send: (request, watch) =>
      new Promise((resolve, reject) => {
        if (gone) {
          resolve(null)
          return
        }

        let finished = false
        let id = 0
        let running: Worker | null = null
        const finish = (): void => {
          finished = true
          watch?.signal?.removeEventListener('abort', give)
        }
        const give = (): void => {
          if (finished || !waiting.delete(id)) return
          if (running) takeBack(running, id)
          finish()
          resolve(null)
        }

        if (!watch?.signal?.aborted) watch?.signal?.addEventListener('abort', give)
        id = port.claim()
        try {
          running = port.running()
          const { message, transfer } = request(id)
          running.postMessage(message, transfer ?? [])
          waiting.set(id, {
            resolve: value => {
              finish()
              resolve(value)
            },
            reject: error => {
              finish()
              reject(error)
            },
            onProgress: watch?.onProgress,
          })
        } catch (error) {
          finish()
          reject(error)
        }
        if (watch?.signal?.aborted) give()
      }),

    dispose: () => {
      gone = true
      worker?.terminate()
      worker = null
      // Resolved, not rejected: a window closing is nobody's failure.
      const abandoned = [...waiting.values()]
      waiting.clear()
      for (const slot of abandoned) slot.resolve(null)
    },
  }

  return port
}
