import { localizedError } from '@shared/localizedError'
import { describe, expect, it, vi } from 'vitest'
import { serial } from './serialPort'
import type { WorkerPort } from './workerPort'

/** A port that answers when the case says so, and counts what was asked of it. */
function askable() {
  const answers: ((value: number | null) => void)[] = []
  const asked: number[] = []
  const port: WorkerPort<number> = {
    claim: () => 0,
    running: () => ({}) as Worker,
    isGone: () => false,
    record: () => {},
    forget: () => true,
    send: request => {
      asked.push(Number(request(asked.length).message))
      return new Promise(resolve => answers.push(resolve))
    },
    dispose: () => {},
  }
  return { answers, asked, port: serial(port, { what: 'testing', depth: 2 }) }
}

const ask = (port: WorkerPort<number>, at: number, signal?: AbortSignal) =>
  port.send(() => ({ message: at }), signal ? { signal } : undefined)

describe('one request at a time on a port', () => {
  // 🛑 The port posts BEFORE it records, and one microtask between the two is a window in which a
  // caller reads a worker nothing was asked of — which is how this envelope was first written.
  it('asks a free port straight away, without waiting a turn of the loop', () => {
    const { asked, port } = askable()

    void ask(port, 1)

    expect(asked).toEqual([1])
  })

  it('holds the next one until the one before it has answered', async () => {
    const { answers, asked, port } = askable()
    void ask(port, 1)
    void ask(port, 2).catch(() => null)

    expect(asked).toEqual([1])
    answers[0]?.(10)

    await vi.waitFor(() => expect(asked).toEqual([1, 2]))
  })

  // A window that has queued that many is one where something upstream asks faster than anything
  // could answer: a refusal, never a queue to grow.
  it('refuses a request the queue has no room for', async () => {
    const { port } = askable()
    void ask(port, 1)
    void ask(port, 2).catch(() => null)
    void ask(port, 3).catch(() => null)

    await expect(ask(port, 4)).rejects.toThrow(
      localizedError('queueFull', { name: 'testing' }).message,
    )
  })

  it('answers nothing for one given up before its turn came, and asks nothing', async () => {
    const { answers, asked, port } = askable()
    const taking = new AbortController()
    void ask(port, 1)
    const waiting = ask(port, 2, taking.signal)

    taking.abort()

    expect(await waiting).toBeNull()
    answers[0]?.(10)
    await vi.waitFor(() => expect(asked).toEqual([1]))
  })
})
