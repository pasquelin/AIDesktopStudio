import type { VramReading } from '@shared/domain/aiMemory'
import type { LocalModel } from '@shared/domain/localModel'
import type { ChatRequest, LoadOptions, LocalRuntime } from './localRuntimes'

/**
 * llama.cpp as a runtime: weights are ordinary files `fileRuntime` already fetches. Only
 * conversing is new, and it runs in process — nothing to install, nothing to keep running.
 */

/** The inference itself, injected: everything above it is testable without a native addon. */
export type LlamaPort = {
  /**
   * Whether the addon this build carries can load a model on THIS machine. Answered rather than
   * assumed: a native module is built per platform, and one that failed to load is ordinary.
   */
  ready: () => boolean
  /** The weights file held in memory right now, or nothing. */
  loaded: () => string | null
  /**
   * Holds the weights and answers what they take once resident — MEASURED, unlike
   * `reservationBytes`. Rejects when the machine refuses the load, never a freeze.
   */
  load: (weights: string, options: LoadOptions) => Promise<number>
  unload: () => Promise<void>
  /** Where the weights sit is resolved by the caller — a port never learns the model folder. */
  chat: (request: ChatRequest, weights: string) => Promise<string>
  /** The runtime's own video-memory reading, or nothing where it cannot open the GPU. */
  vram: () => Promise<VramReading | null>
}

export type LlamaRuntimeDeps = {
  /** The file half, already built: `read`, `install` and `remove` come from there unchanged. */
  files: LocalRuntime
  /** The file a model is loaded FROM — its first weights file, resolved against its folder. */
  weightsOf: (model: LocalModel) => string
  port: LlamaPort
  /** Looked up by the id a request names, because a chat request carries no manifest. */
  modelOf: (modelId: string) => LocalModel | null
  /** Loads through the manager, so a turn cannot create weights outside its idle lifecycle. */
  ensureLoaded: (modelId: string) => Promise<void>
  /** Called when a load or turn starts; the returned function runs when it ends. */
  onUsed?: (modelId: string) => (() => void) | void
}

export function llamaLocalRuntime(deps: LlamaRuntimeDeps): LocalRuntime {
  /** Which of the models handed in the resident weights belong to — a file, never an id. */
  const residentAmong = (models: readonly LocalModel[]): string | null => {
    const weights = deps.port.loaded()
    if (weights === null) return null

    return models.find(model => deps.weightsOf(model) === weights)?.id ?? null
  }

  return {
    // `ready` is the ADDON's, never the disk's: weights that are present with nothing able to open
    // them read as a runtime that is not answering, which is the gesture the screen has to ask for.
    read: async models => {
      const id = residentAmong(models)
      return {
        ...(await deps.files.read(models)),
        ready: deps.port.ready(),
        loaded: new Set(id === null ? [] : [id]),
      }
    },

    install: deps.files.install,
    remove: deps.files.remove,

    load: async (model, options) => {
      const done = deps.onUsed?.(model.id)
      try {
        return await deps.port.load(deps.weightsOf(model), options)
      } finally {
        done?.()
      }
    },
    unload: deps.port.unload,

    chat: async request => {
      const model = deps.modelOf(request.model)
      // Raised rather than answered empty: an empty answer reads as a model that had nothing to add.
      if (model === null) throw new Error(`${request.model} is not in the catalogue`)

      // Held BEFORE the load, as `serviceJobs` does: an endpoint not yet marked working is one an
      // idle sweep or another turn's `admit` may reclaim from under the weights arriving.
      const done = deps.onUsed?.(model.id)
      try {
        await deps.ensureLoaded(model.id)
        return await deps.port.chat(request, deps.weightsOf(model))
      } finally {
        done?.()
      }
    },
  }
}
