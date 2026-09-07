import type { RoleProvider } from '@shared/domain/aiRole'
import type { LocalModel } from '@shared/domain/localModel'
import type { AssistantBrain } from './brainPort'

/**
 * Which brain answers a turn — the manager's decision, honoured rather than second-guessed.
 *
 * Nothing here branches on a cloud's NAME or a runtime's: the wiring owns tables keyed by id and
 * by loader, and this walks them.
 */

export type RoutedBrainDeps = {
  /** What serves the assistant right now, asked on every turn: it is a choice, and choices move. */
  providerOf: () => Promise<RoleProvider | null>
  /** The catalogue entry a stored id names, or nothing — a model can be dropped from a release. */
  modelOf: (modelId: string) => LocalModel | null
  /** A brain over one local model, or nothing when no runtime here can converse with it. */
  localBrain: (model: LocalModel) => AssistantBrain | null
  /** The brain of a cloud, BY ID. A cloud that cannot think answers nothing, never a branch. */
  cloudBrain: (providerId: string) => AssistantBrain | null
  /**
   * What the open project is about. Read HERE and not passed in by the window: this is the one
   * point every brain goes through, and a context a renderer names is one it could forge.
   */
  contextOf: () => Promise<string>
  /**
   * What the studio IS — the space, the document in front, the model armed. Asked of the window
   * on every turn, by the same route and for the same reason as the context above.
   *
   * Empty when no window answered. A turn still happens: the model is then as blind as it was
   * before any of this, which is worse than knowing and better than waiting.
   */
  stateOf: () => Promise<string>
  /**
   * How many memories the open project holds.
   *
   * 🛑 A COUNT, and it replaces a recall that ran on EVERY turn: `[M]` embedding the sentence
   * costs 11 ms and comparing 208 vectors 3 ms, for a block four doors of five had no room to
   * carry. One `count(*)` says the same thing the briefing needs — that there is something to
   * ask — and the model pays for a recall only when it decides to.
   */
  memoriesOf: () => Promise<number>
  // Read here for the same reason as the context: a path the window named is a path the window
  // chose, and `project.create` acts on it.
  foldersOf: () => string
}

/** The brain and, when there is none, the reason — which is the only thing left to say. */
function brainFor(
  deps: RoutedBrainDeps,
  provider: RoleProvider | null,
): [AssistantBrain | null, string] {
  if (provider === null) return [null, 'no provider available']
  if (provider.kind === 'cloud') {
    return [deps.cloudBrain(provider.providerId), `${provider.providerId} cannot think`]
  }

  const model = deps.modelOf(provider.modelId)
  if (model === null) return [null, `${provider.modelId} is not in the catalogue`]

  return [deps.localBrain(model), `nothing here converses with ${model.id}`]
}

/**
 * Raised rather than answered with an empty sentence: the window marks a rejected turn LOST and
 * says so, where an empty answer reads as a model that had nothing to add.
 */
export function createRoutedBrain(deps: RoutedBrainDeps): AssistantBrain {
  return {
    capabilities: async () => {
      const [brain] = brainFor(deps, await deps.providerOf())
      return brain
        ? await brain.capabilities()
        : { streaming: false, structuredJson: true, multimodalImages: false }
    },
    /**
     * Asked of whichever door serves TODAY, and answered `null` where none does — the composer
     * shows the bound of the door in front, and nothing serving is not a window of zero.
     */
    window: async () => {
      const [brain] = brainFor(deps, await deps.providerOf())
      return brain === null ? null : await brain.window()
    },
    think: async (request, watch) => {
      // The four together: WHICH brain answers probes the runtimes, and none of the other three
      // depends on the answer. Serially, the person waited for their sum.
      const [provider, context, state, memories] = await Promise.all([
        deps.providerOf(),
        deps.contextOf(),
        deps.stateOf(),
        deps.memoriesOf(),
      ])

      const [brain, why] = brainFor(deps, provider)
      if (brain === null) throw new Error(`nothing serves the assistant: ${why}`)

      const capabilities = await brain.capabilities()
      const accepted = capabilities.multimodalImages ? request : { ...request, images: undefined }

      return await brain.think(
        {
          ...accepted,
          // A mission already packed this in the main process; overwriting it drops scores, jobs
          // and previous results. The window cannot forge one: `parseThought` strips the field.
          context: accepted.context ?? context,
          state,
          memories,
          folders: deps.foldersOf(),
        },
        watch,
      )
    },
  }
}
