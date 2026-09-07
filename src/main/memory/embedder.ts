import { messageOf } from '@shared/guards'
import type { EmbedClient } from './embedClient'
import type { EmbedWeights } from './embedChoice'

/**
 * The one embedder of the studio. 🛑 Opened LAZILY and let go on idleness: opening a project must
 * not pay for a 318 MB model nobody has questioned, and an afternoon must not hold it — `[M]`
 * 785 ms to load it back.
 */

/** Two minutes: a conversation of several turns pays the load once, an afternoon does not. */
export const EMBEDDER_IDLE_MS = 120_000

export type Embedder = {
  /** Which model would answer, or nothing. Opens NOTHING: it is asked on every recall. */
  chosen: () => string | null
  /** Documents, in the order they were given. Empty where no model can answer. */
  embed: (texts: readonly string[], signal?: AbortSignal) => Promise<readonly Float32Array[]>
  /** One question. An empty vector where no model can answer — see `similarity`. */
  embedQuery: (text: string) => Promise<Float32Array>
  /** Lets go of the process, killing it after `graceMs` if it will not dispose. */
  close: (graceMs?: number) => Promise<void>
}

export type EmbedderDeps = {
  /** Asked afresh on every call: a choice changes without warning. */
  chosenId: () => string | null
  /** Only a LOAD asks this — resolving a path is what `chosen` must not pay for. */
  weightsFor: (modelId: string) => EmbedWeights | null
  /**
   * Forks one. It is handed what to call when the process dies: without that, a fork that
   * crashed stays held and every later call rejects until the studio is restarted.
   */
  open: (onGone: () => void) => EmbedClient
  /** Said when a model will not load at all. The studio goes on without vectors. */
  onTrouble: (message: string) => void
  idleMs: number
  /** The repository's shape for an injected timer — see `dictation/session.ts`. */
  schedule: (run: () => void, delayMs: number) => () => void
}

type Held = {
  modelId: string
  client: EmbedClient
}

export function createEmbedder({
  chosenId,
  weightsFor,
  open,
  onTrouble,
  idleMs,
  schedule,
}: EmbedderDeps): Embedder {
  let held: Held | null = null
  // The PROMISE, never the client: two questions arriving at once must not fork two processes,
  // each loading the same 318 MB.
  let opening: Promise<Held | null> | null = null
  // 🛑 WHICH model the load in flight is for. Without it, `held` is still null while A loads, so
  // the guard below cannot fire and a caller asking for B was handed A's client — and the batch
  // it computed was written under `model = 'B'`, where `dropOtherVectors('B')` never reaches it.
  let loading: string | null = null
  let cancelIdle: (() => void) | null = null
  // The last process let go, still disposing its weights: the next one is not opened over it.
  let releasing: Promise<void> = Promise.resolve()

  const letGo = (graceMs?: number): Promise<void> => {
    const going = held
    held = null
    opening = null
    cancelIdle?.()
    cancelIdle = null
    if (going) releasing = going.client.close(graceMs)
    return releasing
  }

  const restIdle = (): void => {
    cancelIdle?.()
    cancelIdle = idleMs > 0 ? schedule(() => void letGo(), idleMs) : null
  }

  const start = async (modelId: string): Promise<Held | null> => {
    const wanted = weightsFor(modelId)
    if (wanted === null) return null
    await releasing

    // The client is compared on the way out, not captured: a process that died AFTER another
    // was opened must not take the live one with it.
    const client = open(() => {
      if (held?.client === client) void letGo()
    })

    try {
      // The dimensions it answers are checked by `embedClient` and read by nobody after that.
      await client.load(
        wanted.weights,
        wanted.documentPrefix,
        wanted.queryPrefix,
        wanted.contextTokens,
      )
      // Loaded for a choice that moved meanwhile: nobody will hold it, so it goes here, once.
      if (loading !== modelId) {
        releasing = client.close()
        return null
      }
      return { modelId, client }
    } catch (error) {
      // A model that will not load costs the vectors, never the studio: the retrieval falls back
      // on exact search rather than pretending to have searched.
      onTrouble(messageOf(error))
      releasing = client.close()
      await releasing
      return null
    }
  }

  const ready = async (): Promise<Held | null> => {
    const modelId = chosenId()
    if (modelId === null) {
      if (held) void letGo()
      return null
    }
    if (held && held.modelId !== modelId) void letGo()
    if (opening !== null && loading !== modelId) {
      opening = null
      loading = null
    }

    if (opening === null) {
      loading = modelId
      opening = start(modelId)
    }

    const answered = await opening
    if (loading !== modelId) return await ready()

    held = answered
    if (held === null) {
      opening = null
      loading = null
    } else restIdle()

    return held
  }

  return {
    chosen: chosenId,

    embed: async (texts, signal) => {
      if (texts.length === 0) return []

      const current = await ready()
      if (current === null) return []

      try {
        return await current.client.embed(texts, signal)
      } finally {
        restIdle()
      }
    },

    embedQuery: async text => {
      const current = await ready()
      if (current === null) return new Float32Array()

      try {
        return await current.client.embedQuery(text)
      } finally {
        restIdle()
      }
    },

    close: async graceMs => {
      // Awaited first: letting go mid-load leaves a process holding weights nothing will kill,
      // and quitting is exactly when that happens.
      try {
        await opening
      } catch {
        // A load that failed was already reported by `start`, and has nothing left to close.
      }
      await letGo(graceMs)
    },
  }
}
