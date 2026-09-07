import type { AssistantThought } from '@shared/domain/assistant'
import { log } from '@main/log'
import type { ChatRequest, ChatTurn } from '@main/ai/localRuntimes'
import { defined } from '@shared/guards'
import type { AssistantBrain, NotReady, TurnWatch } from './brainPort'
import { answeredTurn, inWindow, notesFor, turnsWith } from './brainTurn'
import { briefingFor, type Briefing } from './instruction'
import { assistantWindow, promptWindow, roomFor, sentenceWithin } from './promptWindow'

/**
 * The assistant's thinking, run on a model on this machine. Same catalogue and same parsing as the
 * cloud brain; only the round trip differs, and nothing was billed.
 */

/** What the journal names a model running HERE — no provider answers for it. */
const LOCAL_DOOR = 'local'

export type LocalBrainDeps = {
  /** The one round trip. Hands back the model's raw text, which `parseReply` reads. */
  chat: (request: ChatRequest) => Promise<string>
  /** Which model answers. Fixed here, because the router settles the choice on every turn. */
  modelId: string
  /** Its window. Required, so a model that declares none cannot reach this at all. */
  contextTokens: number
  notReady?: NotReady
}

/**
 * 🛑 The sentence just typed is the LAST turn, and that is the whole difference with the cloud
 * door: there the instruction is a field beside the inputs, here it is one turn among others, and
 * a chat model answers the last one. Burying it in the `system` turn had the model reply to the
 * turn before it.
 */
function messagesFor(
  briefing: string,
  history: readonly string[],
  utterance: string,
): readonly ChatTurn[] {
  return [
    { role: 'system', content: briefing },
    ...history.map((content): ChatTurn => ({ role: 'user', content })),
    { role: 'user', content: utterance },
  ]
}

export function createLocalBrain({
  chat,
  modelId,
  contextTokens: declared,
  notReady,
}: LocalBrainDeps): AssistantBrain {
  // Once, here: this figure both sizes the briefing and becomes `num_ctx`, and capping only one
  // of the two would either allocate a window nothing fills or compose a briefing nothing holds.
  const contextTokens = assistantWindow(declared)

  const ask = async (
    request: AssistantThought,
    briefing: Briefing,
    watch: TurnWatch,
    complaint?: string,
  ) => {
    // Cut to THIS window and no longer to Scenario's — `sentenceWithin` holds the arithmetic.
    const said = sentenceWithin(request.utterance, briefing.text.length, contextTokens)
    // Raising the window here would quietly ask for memory nothing budgeted: the reservation was
    // measured against the one the manifest declares. The briefing and the sentence are what must
    // survive, so the history is what gives ground — the runtime would cut the briefing first.
    const window = promptWindow(
      briefing.text + said,
      turnsWith(request.history, complaint),
      contextTokens,
    )
    if (window.overrun) {
      log.warn('assistant', `the briefing alone overruns ${modelId}: the runtime will cut it`)
    }

    return {
      answer: await chat({
        model: modelId,
        messages: messagesFor(briefing.text, window.history, said),
        contextTokens,
        json: true,
        // The window travels WITH the frames: it is capped here, so nothing downstream can
        // derive what `promptTokens` is a share of.
        ...defined({
          signal: watch.signal,
          onProgress: watch.onProgress && inWindow(watch.onProgress, contextTokens),
        }),
      }),
      cost: 0,
    }
  }

  return {
    capabilities: async () => ({
      streaming: true,
      structuredJson: true,
      multimodalImages: false,
      contextTokens,
    }),
    // The same figure the frames carry, said before a turn rather than only during one.
    window: () => Promise.resolve({ size: contextTokens, unit: 'tokens', assumed: false }),
    think: async (request, watch = {}) => {
      const briefing = await briefingFor(request, roomFor(contextTokens), notReady)
      return await answeredTurn(
        briefing,
        (shown, complaint) => ask(request, shown, watch, complaint),
        // Every frame of this door names its window, the restart `answeredTurn` emits included.
        watch.onProgress && inWindow(watch.onProgress, contextTokens),
        notesFor(LOCAL_DOOR, modelId, watch),
        watch.discover,
      )
    },
  }
}
