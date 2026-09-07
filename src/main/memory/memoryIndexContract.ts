import type { Memory, MemoryQuery, MemoryRef, MemoryType } from '@shared/domain/assistantMemory'
import type { MemoryVector, PendingVector } from './vectors'

export type MemoryStamp = {
  bytes: number
  modifiedAt: number
}

export type MemoryIndex = {
  /** Adds or replaces, whichever it is — a caller never has to know which. */
  put: (memory: Memory) => void
  putAll: (memories: readonly Memory[]) => void
  /** Takes one out. The file still says it was there — this only stops it being answered. */
  remove: (id: string) => void
  read: (id: string) => Memory | null
  /** How many it holds, without reading a single one of them back. */
  count: () => number
  /**
   * The LIVE memory of this type on this very reference — what `supersedes` is drawn from.
   * 🛑 `live` alone: a pinned memory is a decision to always give it, never one to undo here.
   */
  standingOn: (type: MemoryType, ref: MemoryRef) => Memory | null
  list: (query: MemoryQuery) => readonly Memory[]
  /** Stamps what a retrieval served, which is what later makes an unused memory age. */
  markUsed: (ids: readonly string[], at: string) => void
  /**
   * When each memory was last served, for the ones that ever were — what a rebuild carries over.
   *
   * 🛑 Two columns and no join. Read through `list`, an opening built one placeholder per memory
   * and threw past SQLITE_MAX_VARIABLE_NUMBER — 32 766 — which failed the whole thread, not just
   * the rebuild. It also read every summary, body, ref and link to recover one date.
   */
  served: () => ReadonlyMap<string, string>
  stamp: () => MemoryStamp | null
  restamp: (stamp: MemoryStamp) => void
  /** Empties the tables for a rebuild. The schema stays: the file is what is authoritative. */
  clear: () => void
  /** Writes what an embedder answered. One transaction whatever the batch — see `putAll`. */
  writeVectors: (vectors: readonly MemoryVector[]) => void
  /** What this model has no vector for, oldest first, with the words that make one. */
  withoutVector: (model: string, limit: number) => readonly PendingVector[]
  /** How many are still waiting — what a progress bar divides by, without reading one of them. */
  pendingVectors: (model: string) => number
  /** Forgets what another model produced. A DELETE: the memories themselves have not moved. */
  dropOtherVectors: (model: string) => void
  /**
   * What answers a question, best first — the four voices gathered and ranked here.
   *
   * 🛑 In the INDEX and not in the main process: sweeping the vectors is `[M]` 19 ms of SQL and
   * 12 ms of arithmetic at 10 000 memories, and handing them across a thread boundary to do it
   * elsewhere would clone 30 MB per question asked.
   */
  recall: (ask: RecallAsk) => readonly Memory[]
  /** Drops the vectors of memories the file no longer holds. What the end of a rebuild runs. */
  sweepVectors: () => void
  close: () => void
}

/** What a recall is given. `question` and `model` travel together: one without the other scores
 * nothing. */
export type RecallAsk = {
  text: string
  refs?: readonly MemoryRef[]
  /** The question, embedded and normalised, or nothing where no model could answer. */
  question?: Float32Array
  /** Whose vectors to compare against — a model's own space, never another's. */
  model?: string
  now: string
  limit: number
}
