import { writeQueue } from '@main/persistence'
import { createProcessClient, type ProcessPort } from '@main/processClient'
import { orElse } from '@shared/promises'
import type { EmbedAsk, EmbedRequest, EmbedResponse } from './embedProtocol'

export type EmbedPort = ProcessPort<EmbedRequest, EmbedResponse> & { kill: () => void }

export const EMBEDDER_GONE = 'the embedding process is gone'
export const CLOSE_GRACE_MS = 15_000
// The quit does not wait 15 s on a wedged worker: the OS reclaims what a kill leaves behind.
export const QUIT_CLOSE_GRACE_MS = 2_000

export type EmbedClient = {
  /** Loads the weights and answers how many dimensions they produce. Rejects where it cannot. */
  load: (
    weights: string,
    documentPrefix: string,
    queryPrefix: string,
    contextTokens: number,
  ) => Promise<number>
  /** A batch of documents, in the order they were given. */
  embed: (texts: readonly string[], signal?: AbortSignal) => Promise<readonly Float32Array[]>
  /** One question. The other prefix, and the only difference — see `EmbedLoad`. */
  embedQuery: (text: string) => Promise<Float32Array>
  /** Disposes the worker's weights, then kills it — after `graceMs` if it never answers. */
  close: (graceMs?: number) => Promise<void>
}

export function createEmbedClient(port: EmbedPort): EmbedClient {
  const runs = createProcessClient<EmbedRequest, EmbedResponse, unknown>({
    port,
    runOf: response => response.id,
    read: response =>
      response.ok
        ? { kind: 'settled', result: response.value }
        : { kind: 'failed', error: response.error },
    gone: EMBEDDER_GONE,
    cancel: id => ({ id, cancel: true }),
  })

  // 🛑 One at a time: the process holds ONE context, and two batches inside it at once would
  // share a sequence built for one. What keeps a question from waiting behind a long batch is
  // the SIZE of a batch, not this — see `EMBED_BATCH`.
  const queue = writeQueue()

  const ask = (request: EmbedAsk, signal?: AbortSignal): Promise<unknown> =>
    queue.next(
      async () => await runs.send(id => ({ ...request, id }), { ...(signal && { signal }) }),
    )

  return {
    /**
     * CHECKED rather than cast: a process answering something else did not load, and vectors
     * written against a length nobody verified are unusable floats nothing would report.
     */
    load: async (weights, documentPrefix, queryPrefix, contextTokens) => {
      const dims = await ask({ op: 'load', weights, documentPrefix, queryPrefix, contextTokens })
      if (typeof dims !== 'number' || dims <= 0) {
        throw new Error('the embedder answered no dimensions')
      }

      return dims
    },

    embed: async (texts, signal) =>
      vectorsOf(await ask({ op: 'embed', texts, asQuery: false }, signal)),

    embedQuery: async text => {
      const [vector] = vectorsOf(await ask({ op: 'embed', texts: [text], asQuery: true }))
      // A model that answered nothing for a question cannot answer it: an empty vector compares
      // as nothing alike, which is what a retrieval falls back from.
      return vector ?? new Float32Array()
    },

    close: async (graceMs = CLOSE_GRACE_MS) => {
      let timer: ReturnType<typeof setTimeout> | undefined
      const elapsed = new Promise<void>(resolve => {
        timer = setTimeout(resolve, graceMs)
        timer.unref?.()
      })
      try {
        // A dead process has nothing left to dispose; the kill below still settles its callers.
        await orElse(Promise.race([ask({ op: 'close' }), elapsed]), undefined)
      } finally {
        clearTimeout(timer)
        port.kill()
      }
    },
  }
}

/** A batch of the wrong shape reads as « no vectors », never as empty ones written to the index. */
function vectorsOf(value: unknown): readonly Float32Array[] {
  return Array.isArray(value) ? value.filter(one => one instanceof Float32Array) : []
}
