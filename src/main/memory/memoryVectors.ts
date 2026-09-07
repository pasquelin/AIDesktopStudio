import type { Memory, MemoryRecallAsk, MemoryScope } from '@shared/domain/assistantMemory'
import { messageOf } from '@shared/guards'
import type { Embedder } from './embedder'
import { createEmbedQueue, type EmbedProgress, type EmbedQueue } from './embedQueue'
import type { MemoryHost } from './memoryHost'

/**
 * The vectors of the two memories: one queue each, one embedder for both.
 *
 * A queue per scope because a queue JOINS the run already going — a single one would answer a
 * call about the machine's memory with a count belonging to the project's.
 */
export type MemoryVectors = {
  /**
   * Brings a scope up to date, in the background. Answers nothing: a caller waiting on this waits
   * `[M]` 9,7 ms a memory for something nothing on screen reads. What is missing is `pending`.
   */
  catchUp: (scope: MemoryScope) => void
  pending: (scope: MemoryScope) => Promise<number>
  /** Stops the run in flight; what it wrote is kept. Half an index is not a broken one. */
  stop: (scope: MemoryScope) => void
  /**
   * 🛑 Drops the project's queue and what stops it. Called when the open project CHANGES: `run`
   * JOINS a run already in flight and ignores the holder it is handed, so the next project's
   * `catchUp` returned the previous one's promise and indexed nothing at all.
   */
  release: () => void
  /**
   * What answers a question, best first — the ONE place the question is embedded.
   *
   * 🛑 Not a filter: `MemoryStore.list` narrows by every word, this ranks by any of them and by
   * meaning. What a client reaches through `memory.recall` comes through here.
   *
   * Empty for a studio with no project open, and for one that has learned nothing. Never a
   * refusal: a turn happens with or without a memory, and waiting on one would cost the turn.
   */
  recall: (scope: MemoryScope, ask: MemoryRecallAsk) => Promise<readonly Memory[]>
  /**
   * How many memories a scope holds, without reading one — what the briefing pays instead of a
   * recall. `0` for a studio with no project open, and for one that has learned nothing.
   */
  held: (scope: MemoryScope) => Promise<number>
  close: () => Promise<void>
}

export type MemoryVectorsDeps = {
  host: MemoryHost
  embedder: Embedder
  onProgress: (scope: MemoryScope, progress: EmbedProgress) => void
  onTrouble: (message: string) => void
  closeEmbedder?: boolean
}

/** How many a recall answers when the caller names no limit of its own. */
const RECALL_LIMIT = 10

export function createMemoryVectors({
  host,
  embedder,
  onProgress,
  onTrouble,
  closeEmbedder = true,
}: MemoryVectorsDeps): MemoryVectors {
  const queues = new Map<MemoryScope, EmbedQueue>()
  // One per scope, replaced at each run: an abort raised on the last run must not stop the next
  // one before it has read a single memory.
  const stops = new Map<MemoryScope, AbortController>()

  const queueFor = (scope: MemoryScope): EmbedQueue => {
    const held = queues.get(scope)
    if (held) return held

    const made = createEmbedQueue({
      embedder,
      onProgress: progress => onProgress(scope, progress),
      onTrouble,
    })
    queues.set(scope, made)
    return made
  }

  return {
    catchUp: scope => {
      void indexed(scope)
    },

    pending: async scope => {
      // 🛑 Before the holder, and that ordering is the performance rule: opening a memory opens a
      // thread and a database, and a studio with no embedding model has nothing to count.
      if (embedder.chosen() === null) return 0

      const holder = await host.of(scope)
      return holder === null ? 0 : await queueFor(scope).pending(holder)
    },

    stop: scope => stops.get(scope)?.abort(),

    release: () => {
      stops.get('project')?.abort()
      stops.delete('project')
      queues.delete('project')
    },

    recall: async (scope, ask) => {
      try {
        return await remembered(scope, ask)
      } catch (error) {
        // 🛑 Swallowed on purpose: a dead embedder must cost the answer, never the turn that
        // asked for it — a client gets an empty recall and a line in the journal.
        onTrouble(messageOf(error))
        return []
      }
    },

    held: async scope => {
      try {
        const memory = await host.of(scope)
        return memory === null ? 0 : await memory.count()
      } catch (error) {
        // 🛑 Same contract as `recall`, and it matters more here: `brainRouted` awaits this in
        // the same `Promise.all` as the provider, so a dead memory thread would kill the TURN —
        // over a count the answer does not need.
        onTrouble(messageOf(error))
        return 0
      }
    },

    close: async () => {
      for (const one of stops.values()) one.abort()
      if (closeEmbedder) await embedder.close()
    },
  }

  async function remembered(scope: MemoryScope, ask: MemoryRecallAsk): Promise<readonly Memory[]> {
    const model = embedder.chosen()
    // Together, and neither depends on the other: on the first recall of a session both are cold
    // — a worker thread and a database against `[M]` 785 ms of loading the embedding model.
    // 🛑 Embedded ONLY where a model can answer: a studio without one pays nothing for the
    // attempt, and falls back on exact search rather than pretending to have searched.
    const [memory, question] = await Promise.all([
      host.of(scope),
      model === null ? undefined : embedder.embedQuery(ask.text),
    ])
    if (memory === null) return []

    const found = await memory.recall({
      text: ask.text,
      refs: ask.refs ?? [],
      ...(question && question.length > 0 && model ? { question, model } : {}),
      now: new Date().toISOString(),
      limit: ask.limit ?? RECALL_LIMIT,
    })

    // Stamped as served, which is what later makes an unused memory age.
    if (found.length > 0) void memory.markUsed(found.map(one => one.id))

    return found
  }

  /** Named rather than a floating chain: what it does is index one scope, whatever happens. */
  async function indexed(scope: MemoryScope): Promise<void> {
    try {
      // Asked before anything is opened — see `pending`.
      if (embedder.chosen() === null) return

      const holder = await host.of(scope)
      if (holder === null) return

      const queue = queueFor(scope)
      // 🛑 Replaced only when no run is going. `run` JOINS one already in flight and ignores the
      // new signal, so overwriting here left Stop aborting a controller nothing was watching.
      const stop = (queue.busy() ? stops.get(scope) : null) ?? new AbortController()
      stops.set(scope, stop)
      await queue.run(holder, stop.signal)
    } catch (error) {
      onTrouble(messageOf(error))
    }
  }
}
