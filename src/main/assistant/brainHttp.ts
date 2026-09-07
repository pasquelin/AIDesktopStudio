import type { CloudProviderId, HttpChat } from '@shared/domain/aiCloud'
import type { AssistantThought } from '@shared/domain/assistant'
import { askCloudChat, takesTools, type CloudPoster } from '@main/ai/cloudChat'
import { chatToolsFor, foldedReply } from './chatTools'
import type { ChatTurn } from '@main/ai/localRuntimes'
import { log } from '@main/log'
import type { Credentials } from '@main/settings/accounts'
import { defined } from '@shared/guards'
import type { AssistantBrain, NotReady, TurnWatch } from './brainPort'
import { answeredTurn, notesFor, turnsWith } from './brainTurn'
import { briefingFor, type Briefing } from './instruction'
import { ASSISTANT_WINDOW_MAX, roomFor } from './promptWindow'

const ASK_TOKENS = 4096

/**
 * The window a chat cloud is taken to hold — an ASSUMPTION, said as one: the model here is TYPED
 * BY HAND and none of these clouds publishes its window over the API, so the defaults bound
 * nothing. What degrades when it is wrong is `CLOUD_FALLBACK_TOKENS`, one round trip.
 *
 * 🛑 `[M]` It was 32 000, which gave `roomFor` 90 828 characters against a catalogue costing
 * 90 994 — the state, the context and the folders were all cut to fit it. Measured 2026-08-31 on
 * the 437 scenarios of `pnpm banc` against deepseek-chat: 55% → 61% passed, 2 069 → 1 548 rounds,
 * 496 → 269 refusals.
 *
 * `[M]` A context-free turn still carried 108 426 characters on 2026-09-05: this room keeps every
 * manual that fits, not only those a chain opened. This number therefore constrains the
 * briefing, but it is still not the model's known window.
 *
 * 🛑 It budgets the BRIEFING and nothing else: `messagesFor` sends the history unbounded, where
 * `brainLocal` trims it through `promptWindow`. Ten blocks and a paste can add 110 020 characters
 * — a real overrun comes back a 400 and `readOrNarrow` answers it, which is why it costs a round
 * trip rather than the turn.
 */
export const CLOUD_CONTEXT_TOKENS = 64_000

/**
 * And what one that REFUSED that is taken to hold — `ASSISTANT_WINDOW_MAX`, the window the short
 * briefing is composed against everywhere else. Through `roomFor` like the other two doors: the
 * reply and the sentence get their room from the same arithmetic, rather than from a number
 * written here that reserved neither.
 *
 * 🛑 `[M]` It was 4 096 — an Ollama TAG's figure, on a door no Ollama model reaches — leaving the
 * briefing 7 116 characters against a catalogue costing 7 098: eighteen of margin, and the folders
 * block dropped whole. No chat cloud here holds under 8 192.
 */
const CLOUD_FALLBACK_TOKENS = ASSISTANT_WINDOW_MAX

export type HttpBrainDeps = {
  chat: HttpChat
  /** The provider — see the `sent` note, which says why it is not `chat.kind`. */
  cloud: CloudProviderId
  credentials: () => Credentials | null
  /** Which model of that cloud answers. Read on each turn: it is a setting, and settings change. */
  model: () => string
  fetch?: CloudPoster
  notReady?: NotReady
}

function messagesFor(
  briefing: string,
  history: readonly string[],
  utterance: string,
): readonly ChatTurn[] {
  // One user turn: Anthropic (and Gemini) refuse two user messages in a row, and the history
  // arrives already rendered as lines rather than as alternating roles.
  const prior = history.length > 0 ? `${history.join('\n\n')}\n\n` : ''
  return [
    { role: 'system', content: briefing },
    { role: 'user', content: prior + utterance },
  ]
}

/**
 * A chat cloud reached over HTTP. Same briefing and same JSON parse as the local brain;
 * only the round trip differs, and nothing is billed in studio units.
 */
export function createHttpChatBrain({
  chat,
  cloud,
  credentials,
  model,
  fetch: post,
  notReady,
}: HttpBrainDeps): AssistantBrain {
  const send = post ?? fetch
  /**
   * Whether this door has already refused the whole catalogue AND answered the short one. Both
   * halves matter: a 400 for a model name nobody knows refuses either briefing, and would
   * otherwise narrow this door for the life of the process on a fault that is not about size.
   */
  let narrowed = false

  const round = async (
    request: AssistantThought,
    briefing: Briefing,
    watch: TurnWatch,
    native: boolean,
    complaint?: string,
  ) => {
    const held = credentials()
    if (held === null) throw new Error(`${chat.kind} has no key`)

    // The sentence arrives whole: the channel already bounds it, and what used to cut it here was
    // Scenario's ten thousand characters — a ceiling none of these clouds has.
    const messages = messagesFor(
      briefing.text,
      turnsWith(request.history, complaint),
      request.utterance,
    )

    try {
      // The model is settled HERE and nowhere deeper: what a cloud is talked to with is a
      // setting, and the three request shapes below only ever read the one they were handed.
      const asked = { ...chat, model: model() }
      // The tools follow the briefing SHOWN, expansions included: what has fields is callable.
      const tools = native ? chatToolsFor(briefing.loaded) : undefined
      const answer = await askCloudChat(
        {
          chat: asked,
          key: held.key,
          messages,
          images: request.images,
          json: true,
          maxTokens: ASK_TOKENS,
          ...defined({ signal: watch.signal, onProgress: watch.onProgress, tools }),
        },
        send,
      )
      if (briefing.narrow === null) narrowed = true
      return { answer: foldedReply(answer), cost: 0 }
    } catch (error) {
      log.warn('assistant', `${chat.kind} thinking failed: ${String(error)}`)
      throw error
    }
  }

  return {
    capabilities: async () => ({
      streaming: true,
      structuredJson: true,
      multimodalImages: chat.multimodalImages === true && model() === chat.model,
      maxOutputTokens: ASK_TOKENS,
    }),
    // 🛑 None, and INVENTING one is the defect this says no to: neither figure below is a window,
    // both are briefing budgets, and one worn as a window is the `2 067 / 4 096` shown for
    // DeepSeek. No chat cloud here publishes its window over the API, so there is nothing to read.
    window: () => Promise.resolve(null),
    think: async (request, watch = {}) => {
      // A mission alone has candidates to hand over as tools; the door says whether it takes them.
      const native = request.candidates !== undefined && takesTools({ chat, ...watch })
      const composed = await briefingFor(
        request,
        roomFor(CLOUD_CONTEXT_TOKENS),
        notReady,
        roomFor(CLOUD_FALLBACK_TOKENS),
        native,
      )
      // 🛑 Narrowed by the DOOR, not by the room: the names fit everywhere, so a door that has
      // already refused once would be composed the wide rules again and refuse them again — one
      // billed round trip per turn, for ever. Asking short from the start is what that buys.
      const briefing = narrowed ? (composed.narrow?.() ?? composed) : composed

      // 🛑 No window travels with these frames: the composer shows the count ALONE, as it does
      // for Scenario. Both figures above are assumptions — `2 067 / 4 096` was shown for DeepSeek,
      // whose window is far larger, off a number that only ever budgeted the briefing.
      return await answeredTurn(
        briefing,
        (shown, complaint) => round(request, shown, watch, native, complaint),
        watch.onProgress,
        notesFor(cloud, model(), watch),
        watch.discover,
      )
    },
  }
}
