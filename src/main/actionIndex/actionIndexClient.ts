import type { ProcessPort } from '@main/processClient'
import type { ActionIndex } from './actionIndex'
import type {
  ActionIndexOp,
  ActionIndexRequest,
  ActionIndexResponse,
  ActionIndexResults,
} from './actionIndexProtocol'

export type AsyncActionIndex = {
  [Op in keyof ActionIndex]: (
    ...args: Parameters<ActionIndex[Op]>
  ) => Promise<Awaited<ReturnType<ActionIndex[Op]>>>
}

export type ActionIndexPort = ProcessPort<ActionIndexRequest, ActionIndexResponse> & {
  terminate: () => Promise<void>
}

type Waiting = { resolve: (value: unknown) => void; reject: (error: Error) => void }

export function createActionIndexClient(port: ActionIndexPort): AsyncActionIndex {
  const waiting = new Map<number, Waiting>()
  let nextId = 0
  let closed: Error | null = null
  port.onMessage(response => {
    const held = waiting.get(response.id)
    if (!held) return
    waiting.delete(response.id)
    if (response.ok) held.resolve(response.value)
    else held.reject(new Error(response.error))
  })
  port.onFailure(error => {
    closed = error
    for (const held of waiting.values()) held.reject(error)
    waiting.clear()
  })

  const ask = <Op extends ActionIndexOp>(
    request: Omit<Extract<ActionIndexRequest, { op: Op }>, 'id'>,
  ): Promise<ActionIndexResults[Op]> =>
    new Promise((resolve, reject) => {
      if (closed) {
        reject(closed)
        return
      }
      const id = ++nextId
      // The protocol pairs every operation with one result; TypeScript cannot narrow generics here.
      waiting.set(id, { resolve: value => resolve(value as ActionIndexResults[Op]), reject })
      port.postMessage({ ...request, id } as ActionIndexRequest)
    })

  return {
    rebuild: corpus => ask<'rebuild'>({ op: 'rebuild', corpus }),
    writeEmbeddings: embeddings => ask<'writeEmbeddings'>({ op: 'writeEmbeddings', embeddings }),
    search: search => ask<'search'>({ op: 'search', search }),
    inspect: search => ask<'inspect'>({ op: 'inspect', search }),
    fingerprint: () => ask<'fingerprint'>({ op: 'fingerprint' }),
    embeddingModel: () => ask<'embeddingModel'>({ op: 'embeddingModel' }),
    count: () => ask<'count'>({ op: 'count' }),
    close: async () => {
      try {
        if (!closed) await ask<'close'>({ op: 'close' })
      } finally {
        closed ??= new Error('the action index is closed')
        for (const held of waiting.values()) held.reject(closed)
        waiting.clear()
        await port.terminate()
      }
    },
  }
}
