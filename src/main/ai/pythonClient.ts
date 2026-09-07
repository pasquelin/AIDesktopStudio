import { log } from '@main/log'
import { createProcessClient } from '@main/processClient'
import type { PythonPort } from './pythonProcess'
import {
  CANCEL_OP,
  engineRequest,
  isHello,
  isJobProgress,
  isSettledJob,
  isWorkerHello,
  PROTOCOL_VERSION,
  readHardware,
  readRequirements,
  readMemoryLedger,
  readOpenedJob,
  type EngineDoorMemory,
  type EngineFrame,
  type EngineHardware,
  type EngineRequirements,
  type EngineHello,
  type EngineJobOp,
  type EngineRequest,
  type EngineRequirementsProfile,
  type EngineSettledJob,
} from './pythonProtocol'

/**
 * One engine process, from its greeting to its death. Numbering the runs, holding the promises and
 * rejecting the lot when it dies are `processClient`'s; what is here is what differs — a handshake
 * that comes unasked, and a deadline on everything.
 */

/** Reading a Python stack can fail — and it can also hang, which no exit code ever reports. */
export const HELLO_TIMEOUT_MS = 10_000

/**
 * The whole of the health check, and it costs nothing while nothing is in flight: an engine that
 * stops answering is dead, whatever the process table says. A heartbeat would measure the same.
 */
export const REQUEST_TIMEOUT_MS = 5_000

const GONE = 'the local AI engine is gone'

/** What a caller wants to know while a job runs, and what stops it. */
type EngineJobWatch = {
  /** From 0 to 1, pushed between two steps by the door itself. */
  readonly onStep?: (ratio: number, phase?: string) => void
  readonly signal?: AbortSignal
}

export type PythonListeners = {
  /** The engine failed AFTER it greeted — as opposed to failing to greet at all. */
  onFailure: (error: Error) => void
}

export type PythonClient = {
  /** Resolves on the greeting, rejects when the versions disagree or none arrives in time. */
  ready: Promise<EngineHello>
  hardware: () => Promise<EngineHardware>
  /**
   * What every door last reported, ASKED and never computed — R2 of ADR-19: no caller may add back
   * what a release was expected to return. Answered by the core, so it wakes no door.
   */
  memory: () => Promise<readonly EngineDoorMemory[]>
  /**
   * What the door's environment is missing, if anything. Answered by the core, so it wakes no
   * door and imports no tensor library — a door started to be told it holds nothing is 682 MB.
   */
  requirements: (profile?: EngineRequirementsProfile) => Promise<EngineRequirements>
  /**
   * Opens a JOB on a door and waits for the event that settles it — reading gigabytes and running
   * an inference are the two things `REQUEST_TIMEOUT_MS` must never bound.
   */
  job: (
    op: EngineJobOp,
    params: Readonly<Record<string, unknown>>,
    watch?: EngineJobWatch,
  ) => Promise<EngineSettledJob>
  close: () => void
}

export function createPythonClient(port: PythonPort, listeners: PythonListeners): PythonClient {
  let closed = false
  let settleReady: {
    resolve: (hello: EngineHello) => void
    reject: (error: Error) => void
  } | null = null

  // The executor runs before this returns, so the handshake below always has somewhere to settle.
  const ready = new Promise<EngineHello>((resolve, reject) => {
    settleReady = { resolve, reject }
  })

  // Handled here so a refusal on its way to the caller never surfaces as an unhandled rejection:
  // the greeting can fail before anyone has asked for it.
  void ready.catch(() => {})

  const greeting = setTimeout(
    () => fail(new Error(`the engine did not greet within ${HELLO_TIMEOUT_MS} ms`)),
    HELLO_TIMEOUT_MS,
  )

  function fail(error: Error): void {
    if (closed) return
    closed = true
    clearTimeout(greeting)
    // Killed rather than left running: a process that hangs answers no exit code, and this studio
    // would hold a socket nobody reads for the rest of the session.
    port.kill()

    const waiting = settleReady
    settleReady = null

    // A failure while greeting is that handshake's answer; one after it belongs to whoever holds
    // the engine — the same split `sttClient` makes between a load and a session.
    if (waiting) waiting.reject(error)
    else listeners.onFailure(error)
  }

  const client = createProcessClient<EngineRequest, EngineFrame, unknown>({
    port,
    // An event belongs to no run, and no run is ever numbered zero.
    runOf: frame => ('id' in frame ? frame.id : 0),
    read: frame =>
      'err' in frame
        ? { kind: 'failed', error: `${frame.err.code}: ${frame.err.message}` }
        : { kind: 'settled', result: 'ok' in frame ? frame.ok : null },
    gone: GONE,
    cancel: id => engineRequest(id, CANCEL_OP),
  })

  /** Keyed by JOB and not by run: the run that opened one was answered turns earlier. */
  const jobs = new Map<
    string,
    {
      resolve: (job: EngineSettledJob) => void
      reject: (error: Error) => void
      onStep?: (ratio: number, phase?: string) => void
    }
  >()
  let nextJob = 1

  function settleJob(frame: EngineFrame): boolean {
    if (isSettledJob(frame)) {
      const waiting = jobs.get(frame.job)
      jobs.delete(frame.job)
      if (!waiting) return true

      if (frame.evt === 'job.completed') waiting.resolve(frame)
      else
        waiting.reject(
          new Error(`${frame.code ?? 'failed'}: ${frame.message ?? 'the door refused'}`),
        )
      return true
    }
    return false
  }

  function receive(frame: EngineFrame): void {
    if (!('evt' in frame)) return
    if (isJobProgress(frame)) {
      jobs.get(frame.job)?.onStep?.(frame.ratio, frame.phase)
      return
    }
    if (settleJob(frame) || isWorkerHello(frame)) return

    if (!isHello(frame)) {
      log.warn('engine', frame.message ?? 'engine runtime error')
      return
    }

    // Killed, never degraded: a stale engine sitting in a cache would answer half the vocabulary
    // and fail at whichever call happened to need the other half.
    if (frame.protocol !== PROTOCOL_VERSION) {
      fail(
        new Error(
          `the engine speaks protocol ${frame.protocol}, the studio speaks ${PROTOCOL_VERSION}`,
        ),
      )
      return
    }

    clearTimeout(greeting)
    const waiting = settleReady
    settleReady = null
    waiting?.resolve(frame)
  }

  port.onMessage(receive)

  port.onFailure(error => {
    // Every job in flight belongs to the process that just died, and nothing will ever settle it.
    const waiting = [...jobs.values()]
    jobs.clear()
    for (const slot of waiting) slot.reject(new Error(GONE))
    fail(error)
  })

  const beforeDeadline = <T>(work: Promise<T>, what: string): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const deadline = setTimeout(() => {
        const late = new Error(`the engine did not answer ${what} within ${REQUEST_TIMEOUT_MS} ms`)
        reject(late)
        fail(late)
      }, REQUEST_TIMEOUT_MS)

      void work.then(resolve, reject).finally(() => clearTimeout(deadline))
    })

  return {
    ready,

    hardware: async () => {
      if (closed) throw new Error(GONE)

      const answer = await beforeDeadline(
        client.send(id => engineRequest(id, 'hardware.info')),
        'hardware.info',
      )
      return readHardware(answer)
    },

    requirements: async (profile = 'diffusion') => {
      if (closed) throw new Error(GONE)

      return readRequirements(
        await beforeDeadline(
          client.send(id => engineRequest(id, 'engine.requirements', { profile })),
          'engine.requirements',
        ),
      )
    },

    memory: async () => {
      if (closed) throw new Error(GONE)

      const answer = await beforeDeadline(
        client.send(id => engineRequest(id, 'memory.ledger')),
        'memory.ledger',
      )
      return readMemoryLedger(answer)
    },

    job: async (op, params, watch = {}) => {
      if (closed) throw new Error(GONE)

      const id = `local_${nextJob++}`
      const settled = new Promise<EngineSettledJob>((resolve, reject) => {
        jobs.set(id, { resolve, reject, onStep: watch.onStep })
      })

      // Cancelled by JOB: the engine's own numbering is its business, and it is the door's reading
      // thread that answers — which is the whole reason that thread exists.
      const drop = (): void => {
        void client.send(run => engineRequest(run, CANCEL_OP, { jobId: id })).catch(() => {})
      }
      watch.signal?.addEventListener('abort', drop, { once: true })

      try {
        const opened = await beforeDeadline(
          client.send(run => engineRequest(run, op, { ...params, jobId: id })),
          op,
        )
        // The door answers the job it opened, and a door answering another one is a door this
        // client would wait on for ever.
        if (readOpenedJob(opened) !== id)
          throw new Error(`the engine opened another job than ${id}`)
      } catch (error) {
        // The job never opened, so nothing will ever settle it: dropped here or held for the rest
        // of the session.
        jobs.delete(id)
        watch.signal?.removeEventListener('abort', drop)
        throw error
      }

      if (watch.signal?.aborted) drop()

      return settled.finally(() => watch.signal?.removeEventListener('abort', drop))
    },

    close: () => {
      closed = true
      const orphans = [...jobs.values()]
      jobs.clear()
      for (const slot of orphans) slot.reject(new Error(GONE))
      clearTimeout(greeting)
      const waiting = settleReady
      settleReady = null
      // Rejected rather than left pending: whoever awaited the greeting would otherwise wait for a
      // process that has just been killed, and nothing would ever answer.
      waiting?.reject(new Error(GONE))
      port.kill()
    },
  }
}
