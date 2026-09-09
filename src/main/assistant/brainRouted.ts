import type { RoleProvider } from '@shared/domain/aiRole'
import type { LocalModel } from '@shared/domain/localModel'
import type { ActionLookup, AssistantBrain } from './brainPort'

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
  /**
   * The actions a sentence points at, through the studio's one search engine — `actionIndex`.
   *
   * 🛑 Here and not in a door: a mission already picks its candidates this way, and a chat turn
   * that skipped it was composed EVERY manual instead — 310 of them, 106 391 of the 117 364
   * characters sent per round trip (measured 2026-09-09 on deepseek-chat).
   */
  findActions: ActionLookup
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
 * How many manuals a chat sentence opens. Twice what a mission's step takes, which has a title
 * and a goal to narrow it where a sentence has neither — at the registry's ~343 characters a
 * manual, some 8 200 against the 106 391 that every manual costs.
 *
 * 🛑 Not a ceiling on what the turn may reach: `unloadedIn` opens what the model names anyway,
 * and `actions.find` opens what it cannot name. This is where it STARTS from.
 */
const CHAT_CANDIDATES = 24

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
      // The five together: WHICH brain answers probes the runtimes, and none of the others
      // depends on the answer. Serially, the person waited for their sum.
      const [provider, context, state, memories, found] = await Promise.all([
        deps.providerOf(),
        deps.contextOf(),
        deps.stateOf(),
        deps.memoriesOf(),
        // A mission packed its own candidates from the same engine; searching again would rank
        // the STEP's sentence against the mission's and hand back a different set.
        request.candidates ? undefined : deps.findActions(request.utterance, CHAT_CANDIDATES),
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
          /**
           * 🛑 Undefined when the search answered nothing — an index still building, an engine
           * that failed, a sentence of two words nothing matches. Undefined means every manual,
           * which is heavy and complete; an empty list would mean a model shown the names of 310
           * actions and the fields of none.
           */
          candidates: accepted.candidates ?? (found?.length ? found : undefined),
        },
        {
          ...watch,
          // The one place it is filled. Without it `answeredTurn` fell back to a second search
          // engine of its own — see `expand` in `instruction.ts`.
          discover: watch?.discover ?? (query => deps.findActions(query)),
        },
      )
    },
  }
}
