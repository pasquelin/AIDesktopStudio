import { localizedError } from '@shared/localizedError'
import { describe, expect, it, vi } from 'vitest'
import { createWorkerSession } from './workerSession'

type Answer = { id: number; value: string }

function fakeWorker() {
  const listeners: ((event: MessageEvent<Answer>) => void)[] = []
  const posted: unknown[] = []
  const worker = {
    postMessage: (message: unknown) => {
      posted.push(message)
    },
    addEventListener: (type: string, listener: (event: MessageEvent<Answer>) => void) => {
      if (type === 'message') listeners.push(listener)
    },
    terminate: vi.fn(),
  } as unknown as Worker

  return {
    worker,
    posted,
    reply: (data: Answer) => {
      for (const listener of listeners) listener({ data } as MessageEvent<Answer>)
    },
  }
}

describe('createWorkerSession', () => {
  it('resolves the answer that carries the same id', async () => {
    const fake = fakeWorker()
    const session = createWorkerSession<{ id: number }, Answer>(() => fake.worker)
    const id = session.nextId()
    const pending = session.send({ id })
    fake.reply({ id, value: 'ok' })
    await expect(pending).resolves.toEqual({ id, value: 'ok' })
  })

  it('rejects what is in flight and terminates the worker', async () => {
    const fake = fakeWorker()
    const session = createWorkerSession<{ id: number }, Answer>(() => fake.worker)
    const pending = session.send({ id: session.nextId() })
    session.dispose()

    await expect(pending).rejects.toThrow(localizedError('workerStopped').message)
    expect(fake.worker.terminate).toHaveBeenCalledOnce()
  })
})
