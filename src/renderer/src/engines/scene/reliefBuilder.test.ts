import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_RELIEF_ELEVATION,
  DEFAULT_RELIEF_ORIGIN,
  DEFAULT_RELIEF_SIZE,
} from '@shared/domain/scene'
import { createReliefBuilder } from './reliefBuilder'
import type { ReliefBuildRequest } from './reliefBuildMessage'

const EXTENT = {
  origin: DEFAULT_RELIEF_ORIGIN,
  size: DEFAULT_RELIEF_SIZE,
  elevation: DEFAULT_RELIEF_ELEVATION,
}

const samples = () => ({ width: 2, height: 2, values: Float32Array.from([0, 1, 2, 3]) })

function fakeWorker() {
  const sent: {
    message: ReliefBuildRequest | { id: number; cancel: true }
    transfer: unknown[]
  }[] = []
  const listeners = new Map<string, (event: Event) => void>()
  const worker = {
    addEventListener: (type: string, listener: (event: Event) => void) => {
      listeners.set(type, listener)
    },
    postMessage: (message: ReliefBuildRequest, transfer: unknown[] = []) =>
      sent.push({ message, transfer }),
    terminate: vi.fn(),
  }
  return { sent, listeners, spawn: vi.fn((): Worker => worker as unknown as Worker) }
}

describe('the relief builder', () => {
  it('hands the whole heightmap to a worker, transferring the buffer rather than copying it', () => {
    const fake = fakeWorker()
    const builder = createReliefBuilder(fake.spawn)
    const held = samples()

    void builder.build(held, EXTENT, 2, [], new AbortController().signal)

    const posted = fake.sent[0]
    expect(fake.spawn).toHaveBeenCalledOnce()
    expect(posted?.message).toMatchObject({ width: 2, height: 2, grain: 2 })
    // A copy of the caller's own array, and its buffer given AWAY: the document keeps its samples
    // and the worker gets the memory rather than a second megabyte per rebuild.
    expect(posted?.transfer).toHaveLength(1)
    expect(held.values).toHaveLength(4)
  })

  it('takes a build back when the caller aborts, and answers nothing', async () => {
    const fake = fakeWorker()
    const builder = createReliefBuilder(fake.spawn)
    const abort = new AbortController()

    const building = builder.build(samples(), EXTENT, 2, [], abort.signal)
    abort.abort()

    // The whole point of leaving the thread: two strokes in a row must not queue two full builds.
    await expect(building).resolves.toBeNull()
    expect(fake.sent.at(-1)?.message).toMatchObject({ cancel: true })
  })
})
