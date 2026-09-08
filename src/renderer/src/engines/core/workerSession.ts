import { localizedError } from '@shared/localizedError'
type Pending<Response> = {
  resolve: (value: Response) => void
  reject: (error: Error) => void
}

/**
 * One worker kept for the session, keyed by message `id`.
 *
 * RGBE still forks per call: an export is rare and holds tens of megabytes. Decode and film
 * frames are frequent, so the thread stays up.
 */
export function createWorkerSession<
  Request extends { id: number },
  Response extends { id: number } = Request,
>(open: () => Worker) {
  let worker: Worker | null = null
  let next = 0
  const pending = new Map<number, Pending<Response>>()

  const workerOf = (): Worker => {
    if (worker) return worker

    const started = open()
    started.addEventListener('message', (event: MessageEvent<Response>) => {
      const waiting = pending.get(event.data.id)
      if (!waiting) return
      pending.delete(event.data.id)
      waiting.resolve(event.data)
    })
    started.addEventListener('error', event => {
      const error = new Error(event.message)
      for (const waiting of pending.values()) waiting.reject(error)
      pending.clear()
      started.terminate()
      worker = null
    })
    worker = started
    return started
  }

  return {
    nextId: (): number => {
      const id = next
      next += 1
      return id
    },
    send: (message: Request, transfer: Transferable[] = []): Promise<Response> =>
      new Promise((resolve, reject) => {
        pending.set(message.id, { resolve, reject })
        try {
          workerOf().postMessage(message, transfer)
        } catch (error) {
          pending.delete(message.id)
          reject(error instanceof Error ? error : new Error(String(error)))
        }
      }),
    dispose: (): void => {
      const error = localizedError('workerStopped')
      for (const waiting of pending.values()) waiting.reject(error)
      pending.clear()
      worker?.terminate()
      worker = null
    },
  }
}
