import { describe, expect, it, vi } from 'vitest'
import type { PythonClient, PythonListeners } from './pythonClient'
import {
  BACKOFF_BASE_MS,
  createPythonSupervisor,
  EngineMissingError,
  FAILURE_WINDOW_MS,
  MAX_FAILURES,
  type PythonSupervisorHost,
} from './pythonSupervisor'
import { PROTOCOL_VERSION, type EngineHello } from './pythonProtocol'

const HELLO: EngineHello = {
  v: PROTOCOL_VERSION,
  evt: 'engine.hello',
  engine: '0.1.0',
  protocol: PROTOCOL_VERSION,
  python: '3.12.2',
  platform: 'darwin',
}

/** `outcomes` is read one per open: `false` is an engine that never greets. */
function harness(outcomes: readonly boolean[] = []) {
  let clock = 0
  let opens = 0
  const delays: number[] = []
  const opened: PythonClient[] = []
  const listeners: PythonListeners[] = []

  const host: PythonSupervisorHost = {
    open: heard => {
      const greets = outcomes[opens] ?? true
      opens += 1
      listeners.push(heard)

      const client: PythonClient = {
        ready: greets ? Promise.resolve(HELLO) : Promise.reject(new Error('it did not greet')),
        hardware: vi.fn(),
        job: vi.fn(),
        memory: vi.fn(),
        requirements: vi.fn(),
        close: vi.fn(),
      }
      opened.push(client)
      return client
    },
    now: () => clock,
    delay: ms => {
      delays.push(ms)
      clock += ms
      return Promise.resolve()
    },
  }

  return {
    supervisor: createPythonSupervisor(host),
    delays,
    opened,
    tick: (ms: number) => (clock += ms),
    kill: (error = new Error('the engine exited with code 1')) =>
      listeners[listeners.length - 1]?.onFailure(error),
    opens: () => opens,
  }
}

describe('holding one engine', () => {
  it('opens it once and hands the same one to everybody', async () => {
    const held = harness()

    expect(await held.supervisor.engine()).toBe(await held.supervisor.engine())
    expect(held.opens()).toBe(1)
  })

  it('shares one start between the callers that arrive together', async () => {
    const held = harness()
    const [first, second] = await Promise.all([held.supervisor.engine(), held.supervisor.engine()])

    expect(first).toBe(second)
    expect(held.opens()).toBe(1)
  })

  it('opens another one after the engine died', async () => {
    const held = harness()
    await held.supervisor.engine()
    held.kill()

    expect(await held.supervisor.engine()).toBe(held.opened[1])
  })

  it('lets go of the engine it holds when the studio goes away', async () => {
    const held = harness()
    const engine = await held.supervisor.engine()
    held.supervisor.dispose()

    expect(engine?.close).toHaveBeenCalled()
  })

  /** Otherwise the engine that greeted after the ask to quit is one nobody will ever close. */
  it('lets go of an engine that greets after the studio went away', async () => {
    const held = harness()
    const starting = held.supervisor.engine()
    held.supervisor.dispose()

    expect(await starting).toBeNull()
    expect(held.opened[0]?.close).toHaveBeenCalled()
  })
})

describe('an engine that is not on this disk', () => {
  // A worktree without `pnpm engine:fetch` — measured 2026-09-06: three spawns, three ENOENT,
  // a backoff between each, and a job that ended on the word `rejected`.
  it('gives up at once and says the engine is not installed', async () => {
    let opens = 0
    const supervisor = createPythonSupervisor({
      open: () => {
        opens += 1
        throw new EngineMissingError('/nowhere/python3')
      },
      now: () => 0,
      delay: () => Promise.resolve(),
    })

    expect(await supervisor.engine()).toBeNull()
    expect(await supervisor.engine()).toBeNull()
    expect(opens).toBe(1)
    expect(supervisor.whyNot()).toBe('engine-missing')
  })
})

describe('restarting an engine that will not stay', () => {
  it('waits longer before each attempt', async () => {
    const held = harness([false, false])
    await held.supervisor.engine()

    expect(held.delays).toEqual([BACKOFF_BASE_MS, BACKOFF_BASE_MS * 2])
  })

  /** Otherwise a process that dies on its handshake is forked again by every caller, forever. */
  it('gives up rather than forking for as long as anyone asks', async () => {
    const held = harness(Array.from({ length: MAX_FAILURES }, () => false))

    expect(await held.supervisor.engine()).toBeNull()
    expect(held.opens()).toBe(MAX_FAILURES)
  })

  it('stays given up once it has given up', async () => {
    const held = harness(Array.from({ length: MAX_FAILURES }, () => false))
    await held.supervisor.engine()

    expect(await held.supervisor.engine()).toBeNull()
    expect(held.opens()).toBe(MAX_FAILURES)
  })

  /** The budget counts deaths in a WINDOW: an engine that ran for an hour first is not a bad one. */
  it('forgets a death older than the window', async () => {
    const held = harness()

    for (let round = 0; round < MAX_FAILURES; round += 1) {
      expect(await held.supervisor.engine()).not.toBeNull()
      held.kill()
      held.tick(FAILURE_WINDOW_MS + 1)
    }

    expect(await held.supervisor.engine()).not.toBeNull()
  })
})
