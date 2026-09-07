import { describe, expect, it, vi } from 'vitest'
import { CLOSE_GRACE_MS, createEmbedClient, EMBEDDER_GONE, type EmbedPort } from './embedClient'
import type { EmbedRequest, EmbedResponse } from './embedProtocol'

/** The process, replaced by a list of what was asked and a hand on when each answer comes back. */
function fakePort(): {
  port: EmbedPort
  asked: EmbedRequest[]
  answer: (response: EmbedResponse) => void
  die: (error: Error) => void
  killed: () => number
  /** Waits for the request to have been posted — `inTurn` sends on a later turn, never at once. */
  posted: (count: number) => Promise<void>
} {
  const asked: EmbedRequest[] = []
  let onMessage: (response: EmbedResponse) => void = () => {}
  let onFailure: (error: Error) => void = () => {}
  let kills = 0

  return {
    asked,
    posted: async count => {
      await vi.waitFor(() => expect(asked).toHaveLength(count))
    },
    answer: response => onMessage(response),
    die: error => onFailure(error),
    killed: () => kills,
    port: {
      postMessage: request => asked.push(request),
      onMessage: listener => {
        onMessage = listener
      },
      onFailure: listener => {
        onFailure = listener
      },
      kill: () => {
        kills++
      },
    },
  }
}

describe('loading', () => {
  it('answers the dimensions the weights gave', async () => {
    const fake = fakePort()
    const client = createEmbedClient(fake.port)

    const loading = client.load('/models/e.gguf', 'passage: ', 'query: ', 2048)
    await fake.posted(1)
    fake.answer({ id: 1, ok: true, value: 768 })

    await expect(loading).resolves.toBe(768)
    expect(fake.asked[0]).toMatchObject({ op: 'load', documentPrefix: 'passage: ' })
  })

  /**
   * 🛑 Checked and not cast. A process that answered something else is one that did not load,
   * and vectors written against a length nobody verified are an index of unusable floats that
   * nothing would ever report.
   */
  it('refuses an answer that is not a number of dimensions', async () => {
    const fake = fakePort()
    const client = createEmbedClient(fake.port)

    const loading = client.load('/models/e.gguf', '', '', 2048)
    await fake.posted(1)
    fake.answer({ id: 1, ok: true, value: 'ready' })

    await expect(loading).rejects.toThrow('no dimensions')
  })
})

describe('embedding', () => {
  it('puts the batch in front of the query prefix only for a question', async () => {
    const fake = fakePort()
    const client = createEmbedClient(fake.port)

    const asking = client.embedQuery('why the rail?')
    await fake.posted(1)
    fake.answer({ id: 1, ok: true, value: [new Float32Array([1, 0])] })

    await expect(asking).resolves.toEqual(new Float32Array([1, 0]))
    expect(fake.asked[0]).toMatchObject({ op: 'embed', asQuery: true })
  })

  it('answers an empty vector where the process sent nothing back', async () => {
    const fake = fakePort()
    const client = createEmbedClient(fake.port)

    const asking = client.embedQuery('why the rail?')
    await fake.posted(1)
    fake.answer({ id: 1, ok: true, value: [] })

    await expect(asking).resolves.toEqual(new Float32Array())
  })

  /**
   * 🛑 The process holds ONE context. Two batches inside it at once would share a sequence built
   * for one — the defect `dictation/serial.ts` exists for, on the other engine.
   */
  it('sends one request at a time, in the order they were asked', async () => {
    const fake = fakePort()
    const client = createEmbedClient(fake.port)

    const first = client.embed(['one'])
    const second = client.embed(['two'])
    await fake.posted(1)

    fake.answer({ id: 1, ok: true, value: [new Float32Array([1])] })
    await first
    await fake.posted(2)

    fake.answer({ id: 2, ok: true, value: [new Float32Array([2])] })
    await expect(second).resolves.toEqual([new Float32Array([2])])
  })

  /** A batch that failed must not fail the one behind it, whose text has nothing to do with it. */
  it('sends the next request after one that failed', async () => {
    const fake = fakePort()
    const client = createEmbedClient(fake.port)

    const first = client.embed(['one'])
    const second = client.embed(['two'])
    await fake.posted(1)

    fake.answer({ id: 1, ok: false, error: 'out of memory' })
    await expect(first).rejects.toThrow('out of memory')
    await fake.posted(2)

    fake.answer({ id: 2, ok: true, value: [new Float32Array([2])] })
    await expect(second).resolves.toEqual([new Float32Array([2])])
  })
})

describe('when the process is gone', () => {
  /**
   * A caller left waiting on a dead process is a panel that never draws. The one in flight is
   * told WHY; a later one is told the process is gone, which is all that is left to say.
   */
  it('rejects the caller in flight with the reason, and every later one', async () => {
    const fake = fakePort()
    const client = createEmbedClient(fake.port)

    const asking = client.embed(['one'])
    await fake.posted(1)
    fake.die(new Error('the embedding process exited with code 1'))

    await expect(asking).rejects.toThrow('exited with code 1')
    await expect(client.embed(['two'])).rejects.toThrow(EMBEDDER_GONE)
  })

  it('disposes the model before killing the process', async () => {
    const fake = fakePort()
    const client = createEmbedClient(fake.port)

    const closing = client.close()
    await fake.posted(1)
    expect(fake.asked[0]).toMatchObject({ op: 'close' })
    expect(fake.killed()).toBe(0)

    fake.answer({ id: 1, ok: true, value: undefined })
    await closing
    fake.die(new Error(EMBEDDER_GONE))

    expect(fake.killed()).toBe(1)
    await expect(client.embed(['one'])).rejects.toThrow(EMBEDDER_GONE)
  })

  it('kills the process when graceful disposal fails', async () => {
    const fake = fakePort()
    const client = createEmbedClient(fake.port)

    const closing = client.close()
    await fake.posted(1)
    fake.answer({ id: 1, ok: false, error: 'dispose failed' })

    await expect(closing).resolves.toBeUndefined()
    expect(fake.killed()).toBe(1)
  })

  // The default grace, and the shorter one the quit asks for — a wedged worker is not worth
  // keeping the window on screen 15 s.
  it.each([
    ['its default grace', undefined, CLOSE_GRACE_MS],
    ['the shorter grace it was given', 2_000, 2_000],
  ])('kills the process after %s when disposal never answers', async (_, given, graceMs) => {
    vi.useFakeTimers()
    try {
      const fake = fakePort()
      const client = createEmbedClient(fake.port)

      const closing = client.close(given)
      await vi.advanceTimersByTimeAsync(0)
      expect(fake.asked[0]).toMatchObject({ op: 'close' })

      await vi.advanceTimersByTimeAsync(graceMs - 1)
      expect(fake.killed()).toBe(0)
      await vi.advanceTimersByTimeAsync(1)
      expect(fake.killed()).toBe(1)
      await closing
    } finally {
      vi.useRealTimers()
    }
  })

  /** A batch given up on is dropped at the worker, so what it half-computed is cleaned up there. */
  it('tells the worker to drop a run whose signal was raised', async () => {
    const fake = fakePort()
    const client = createEmbedClient(fake.port)
    const stop = new AbortController()

    const asking = client.embed(['one'], stop.signal)
    await fake.posted(1)
    stop.abort()
    fake.answer({ id: 1, ok: false, error: 'cancelled' })

    await expect(asking).rejects.toThrow('cancelled')
    expect(fake.asked.at(-1)).toEqual({ id: 1, cancel: true })
  })
})
