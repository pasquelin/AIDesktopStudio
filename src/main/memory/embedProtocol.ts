/**
 * What the main process and the embedding process say to each other.
 *
 * A process and not a thread: llama.cpp holds ONE model, and a second load takes the memory of
 * the first — indexing a sentence must not evict the weights the conversation runs on.
 */

/** Everything the engine needs to exist. Sent once; a second one reloads from scratch. */
export type EmbedLoad = {
  op: 'load'
  /** The `.gguf` on disk. Resolved by the caller: a worker never learns the model folder. */
  weights: string
  /**
   * Two and not one: `[M]` 2026-08-28, EmbeddingGemma separated a matching pair from an unrelated
   * one by 0.427 with these and 0.379 without. Empty for a model that asks for neither.
   */
  documentPrefix: string
  queryPrefix: string
  /** The window the manifest declares, as a CEILING — see `embedWorker`. */
  contextTokens: number
}

/** A batch of texts to embed. `asQuery` picks which of the two prefixes goes in front. */
export type EmbedTexts = {
  op: 'embed'
  texts: readonly string[]
  asQuery: boolean
}

/** Disposes the context, weights and addon before the parent terminates the empty process. */
type EmbedClose = { op: 'close' }

/** Split from `EmbedRequest`: `Omit` over a union keeps only the keys every member shares. */
export type EmbedAsk = EmbedLoad | EmbedTexts | EmbedClose

/** Drops a run already given. The worker answers it like any other end — see `processClient`. */
export type EmbedCancel = { id: number; cancel: true }

export type EmbedRequest = (EmbedAsk & { id: number }) | EmbedCancel

export const isEmbedCancel = (request: EmbedRequest): request is EmbedCancel => 'cancel' in request

export type EmbedResponse =
  { id: number; ok: true; value: unknown } | { id: number; ok: false; error: string }
