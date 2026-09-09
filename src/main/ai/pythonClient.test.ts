import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { log } from '@main/log'
import {
  createPythonClient,
  HELLO_TIMEOUT_MS,
  REQUEST_TIMEOUT_MS,
  type PythonListeners,
} from './pythonClient'
import type { PythonPort } from './pythonProcess'
import {
  PROTOCOL_VERSION,
  type EngineFrame,
  type EngineRequest,
  type EngineWorkerHello,
} from './pythonProtocol'

function harness() {
  const sent: EngineRequest[] = []
  const frames: ((frame: EngineFrame) => void)[] = []
  const deaths: ((error: Error) => void)[] = []

  const port: PythonPort = {
    postMessage: message => sent.push(message),
    onMessage: listener => frames.push(listener),
    onFailure: listener => deaths.push(listener),
    kill: vi.fn(),
  }

  const listeners: PythonListeners = { onFailure: vi.fn() }

  return {
    client: createPythonClient(port, listeners),
    port,
    listeners,
    sent,
    say: (frame: EngineFrame) => frames.forEach(listener => listener(frame)),
    crash: (error: Error) => deaths.forEach(listener => listener(error)),
  }
}

const greeting = (protocol = PROTOCOL_VERSION): EngineFrame => ({
  v: PROTOCOL_VERSION,
  evt: 'engine.hello',
  engine: '0.1.0',
  protocol,
  python: '3.12.2',
  platform: 'darwin',
})

const machine = {
  platform: 'darwin',
  machine: 'arm64',
  pythonVersion: '3.12.2',
  cpuCount: 12,
  totalBytes: 103_079_215_104,
}

/** A client past its handshake — what every case but the handshake's own starts from. */
const opened = async () => {
  const held = harness()
  held.say(greeting())
  await held.client.ready
  return held
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('the handshake', () => {
  it('is answered by the greeting the engine sends unasked', async () => {
    const { client, say } = harness()
    say(greeting())

    await expect(client.ready).resolves.toMatchObject({ python: '3.12.2' })
  })

  /** A stale engine would answer half the vocabulary and fail at whichever call needed the rest. */
  it('kills an engine that speaks another protocol rather than degrading', async () => {
    const { client, port, say } = harness()
    say(greeting(PROTOCOL_VERSION + 1))

    await expect(client.ready).rejects.toThrow(String(PROTOCOL_VERSION + 1))
    expect(port.kill).toHaveBeenCalled()
  })

  /** Reading a Python stack can fail — and it can also hang, which no exit code ever reports. */
  it('gives up on an engine that never greets', async () => {
    const { client, port } = harness()
    await vi.advanceTimersByTimeAsync(HELLO_TIMEOUT_MS)

    await expect(client.ready).rejects.toThrow(/greet/)
    expect(port.kill).toHaveBeenCalled()
  })

  it('answers the handshake with a death that happened before it, not the session', async () => {
    const { client, listeners, crash } = harness()
    crash(new Error('the engine exited with code 1'))

    await expect(client.ready).rejects.toThrow('exited with code 1')
    expect(listeners.onFailure).not.toHaveBeenCalled()
  })
})

describe('asking the engine what machine it runs on', () => {
  it('sends one run and reads what came back', async () => {
    const { client, sent, say } = await opened()

    const asked = client.hardware()
    expect(sent).toEqual([{ v: PROTOCOL_VERSION, id: 1, op: 'hardware.info', params: {} }])

    say({ v: PROTOCOL_VERSION, id: 1, ok: machine })
    await expect(asked).resolves.toEqual(machine)
  })

  it('rejects with what the engine refused it for', async () => {
    const { client, say } = await opened()

    const asked = client.hardware()
    say({ v: PROTOCOL_VERSION, id: 1, err: { code: 'failed', message: 'the device is gone' } })

    await expect(asked).rejects.toThrow('the device is gone')
  })

  /** An engine that stops answering is dead, whatever the process table says. */
  it('declares an engine that never answers dead, and stops holding it', async () => {
    const { client, port, listeners } = await opened()

    // Asserted BEFORE the clock turns: the rejection lands while the timers run, and a handler
    // attached after it would be one vitest reports as an unhandled rejection.
    const asked = expect(client.hardware()).rejects.toThrow(/did not answer/)
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS)
    await asked
    expect(listeners.onFailure).toHaveBeenCalled()
    expect(port.kill).toHaveBeenCalled()
  })

  it('refuses to ask anything of an engine that already died', async () => {
    const { client, crash } = await opened()
    crash(new Error('the engine exited with code 9'))

    await expect(client.hardware()).rejects.toThrow(/gone/)
  })
})

describe('closing a door', () => {
  /**
   * A REQUEST and never a job: the core answers it, because a door blocked inside its own
   * `import torch` would never read the frame asking it to leave.
   */
  it('asks the core directly, with no job to settle it', async () => {
    const { client, sent, say } = await opened()

    const asked = client.closeDoor('engine/diffusion')
    expect(sent).toEqual([
      { v: PROTOCOL_VERSION, id: 1, op: 'door.close', params: { door: 'engine/diffusion' } },
    ])

    say({ v: PROTOCOL_VERSION, id: 1, ok: { closed: true } })
    await expect(asked).resolves.toBe(true)
  })

  it('answers that nothing closed for a door nobody had opened', async () => {
    const { client, say } = await opened()

    const asked = client.closeDoor('engine/audio')
    say({ v: PROTOCOL_VERSION, id: 1, ok: { closed: false } })

    await expect(asked).resolves.toBe(false)
  })
})

describe('opening a job on a door', () => {
  /** Reading gigabytes and running an inference are the two things a deadline must never bound. */
  it('waits for the event, not for the answer that opened the job', async () => {
    const held = await opened()
    const running = held.client.job('generate', { prompt: 'a cat' })

    held.say({ v: PROTOCOL_VERSION, id: 1, ok: { jobId: 'local_1' } })
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS * 4)

    held.say({
      v: PROTOCOL_VERSION,
      evt: 'job.completed',
      job: 'local_1',
      path: '/tmp/out.png',
      device: 'mps',
    })

    await expect(running).resolves.toMatchObject({ path: '/tmp/out.png', device: 'mps' })
  })

  it('carries the job it opened down to the engine', async () => {
    const held = await opened()
    void held.client.job('models.load', { folder: '/weights' })

    expect(held.sent[0]).toMatchObject({
      op: 'models.load',
      params: { folder: '/weights', jobId: 'local_1' },
    })
  })

  it('rejects with the reason the door refused for', async () => {
    const held = await opened()
    const running = held.client.job('models.load', {})
    held.say({ v: PROTOCOL_VERSION, id: 1, ok: { jobId: 'local_1' } })

    held.say({
      v: PROTOCOL_VERSION,
      evt: 'job.failed',
      job: 'local_1',
      code: 'memory',
      message: 'no room',
    })

    await expect(running).rejects.toThrow('memory: no room')
  })

  /** A door answering another job than the one asked for is one this client would wait on for ever. */
  it('refuses an engine that opened another job than the one asked for', async () => {
    const held = await opened()
    const running = held.client.job('generate', {})

    held.say({ v: PROTOCOL_VERSION, id: 1, ok: { jobId: 'local_999' } })

    await expect(running).rejects.toThrow(/another job/)
  })

  /** A job that never opened is one nothing will ever settle — held, it would leak for the session. */
  it('holds nothing for a job the engine never opened', async () => {
    const held = await opened()
    const refused = expect(held.client.job('generate', {})).rejects.toThrow(/did not answer/)
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS)
    await refused

    // The engine is dead after a deadline, so a late frame for that job must find nobody waiting.
    expect(() =>
      held.say({ v: PROTOCOL_VERSION, evt: 'job.completed', job: 'local_1', path: '/tmp/x.png' }),
    ).not.toThrow()
  })

  it('drops every job in flight when the engine dies', async () => {
    const held = await opened()
    const running = held.client.job('generate', {})
    held.say({ v: PROTOCOL_VERSION, id: 1, ok: { jobId: 'local_1' } })

    held.crash(new Error('the engine exited with code 1'))

    await expect(running).rejects.toThrow(/gone/)
  })

  it('drops every job in flight when the studio closes the engine', async () => {
    const held = await opened()
    const running = held.client.job('generate', {})
    held.say({ v: PROTOCOL_VERSION, id: 1, ok: { jobId: 'local_1' } })

    held.client.close()

    await expect(running).rejects.toThrow(/gone/)
  })
})

describe('watching a job that runs for seconds', () => {
  const runs = async (held: Awaited<ReturnType<typeof opened>>, watch = {}) => {
    const running = held.client.job('generate', {}, watch)
    held.say({ v: PROTOCOL_VERSION, id: 1, ok: { jobId: 'local_1' } })
    // Fake timers hold the microtask chain that `job` awaits; nothing shorter flushes it.
    await vi.advanceTimersByTimeAsync(0)
    // Wrapped: `await runs(...)` would unwrap the job's own promise and wait for it to settle.
    return { running }
  }

  /** The only thing a denoise says while it runs, and it belongs to no run. */
  it('reports each step the door pushed', async () => {
    const held = await opened()
    const steps: number[] = []
    const { running } = await runs(held, { onStep: (ratio: number) => steps.push(ratio) })

    held.say({ v: PROTOCOL_VERSION, evt: 'job.progress', job: 'local_1', ratio: 0.25 })
    held.say({ v: PROTOCOL_VERSION, evt: 'job.progress', job: 'local_1', ratio: 0.5 })
    held.say({ v: PROTOCOL_VERSION, evt: 'job.completed', job: 'local_1', path: '/tmp/x.png' })

    await running
    expect(steps).toEqual([0.25, 0.5])
  })

  /** A step is not an answer: reporting one must never settle the job it belongs to. */
  it('does not settle a job that only reported progress', async () => {
    const held = await opened()
    const { running } = await runs(held)
    let settled = false
    void running.then(() => (settled = true))

    held.say({ v: PROTOCOL_VERSION, evt: 'job.progress', job: 'local_1', ratio: 0.9 })
    await vi.advanceTimersByTimeAsync(0)

    expect(settled).toBe(false)
    held.say({ v: PROTOCOL_VERSION, evt: 'job.completed', job: 'local_1' })
    await running
  })

  it('asks the engine to drop the job when the caller aborts', async () => {
    const held = await opened()
    const stop = new AbortController()
    const { running } = await runs(held, { signal: stop.signal })

    stop.abort()
    await vi.advanceTimersByTimeAsync(0)

    expect(held.sent.at(-1)).toMatchObject({ op: 'engine.cancel', params: { jobId: 'local_1' } })
    held.say({
      v: PROTOCOL_VERSION,
      evt: 'job.failed',
      job: 'local_1',
      code: 'cancelled',
      message: 'stopped',
    })
    await expect(running).rejects.toThrow('cancelled: stopped')
  })

  /** The door reports what it holds on every answer, and a name it does not read is dropped. */
  it('keeps the memory a door reported when it settled', async () => {
    const held = await opened()
    const { running } = await runs(held)

    held.say({
      v: PROTOCOL_VERSION,
      evt: 'job.completed',
      job: 'local_1',
      heldBytes: 7_766_163_456,
      tensorBytes: 7_036_681_984,
    })

    await expect(running).resolves.toMatchObject({ heldBytes: 7_766_163_456 })
  })
})

describe('a door announcing itself', () => {
  const workerHello: EngineWorkerHello = { v: PROTOCOL_VERSION, evt: 'worker.hello' }

  /** Named rather than left to the fall-through, which would log its absent `runtime.error`. */
  it('is dropped without a word in the log', async () => {
    const warn = vi.spyOn(log, 'warn').mockImplementation(() => {})
    const held = await opened()

    held.say(workerHello)

    expect(warn).not.toHaveBeenCalled()
  })
})
