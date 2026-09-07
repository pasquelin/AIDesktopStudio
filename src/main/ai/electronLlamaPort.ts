import type {
  ChatHistoryItem,
  Llama,
  LlamaChatSession,
  LlamaContext,
  LlamaGrammar,
  LlamaModel,
} from 'node-llama-cpp'
import type { ChatRequest, ChatTurn, LoadOptions } from './localRuntimes'
import type { LlamaPort } from './llamaRuntime'

/**
 * llama.cpp in process — the addon ships a prebuilt binary per platform. 🛑 Imported LAZILY:
 * loading it opens the GPU, and doing that at boot delays the first window of a silent session.
 */

/** One model held at a time: a second would take the memory of the first without freeing it. */
type Loaded = { weights: string; model: LlamaModel }

async function openLlama(): Promise<Llama> {
  const { getLlama } = await import('node-llama-cpp')
  return await getLlama()
}

/** The briefing rides in `systemPrompt`; the history is what was actually said on either side. */
const isSpoken = (turn: ChatTurn): boolean => turn.role !== 'system'

function historyItemOf(turn: ChatTurn): ChatHistoryItem {
  if (turn.role === 'user') return { type: 'user', text: turn.content }
  return { type: 'model', response: [turn.content] }
}

export function electronLlamaPort(): LlamaPort {
  let llama: Llama | null = null
  let loaded: Loaded | null = null
  // Remembered rather than retried: a machine with no usable binary answers the same way every
  // time, and asking again on every compose would open the GPU once per assistant turn.
  let refused = false

  const require = async (): Promise<Llama> => {
    llama ??= await openLlama()
    return llama
  }

  /** Built once: it depends on nothing of a request, and every assistant turn asks for JSON. */
  let json: Promise<LlamaGrammar> | null = null

  const jsonGrammar = async (): Promise<LlamaGrammar> => {
    json ??= (await require()).getGrammarFor('json')
    return await json
  }

  const release = async (): Promise<void> => {
    try {
      // Disposed before the next is read: two sets of weights held at once is what a machine
      // judged able to hold ONE would be asked for, and the second load fails.
      await loaded?.model.dispose()
    } finally {
      loaded = null
    }
    // The typings we ship omit `dispose`; the addon still exposes it and it is what frees Metal.
    const addon = llama as { dispose?: () => Promise<void> } | null
    llama = null
    json = null
    try {
      await addon?.dispose?.()
    } catch {
      // The weights are already gone; a failed addon dispose must not block the next load.
    }
  }

  const hold = async (weights: string, options: LoadOptions): Promise<LlamaModel> => {
    if (loaded && loaded.weights === weights) return loaded.model
    await release()

    try {
      const model = await (
        await require()
      ).loadModel({
        modelPath: weights,
        onLoadProgress: options.onProgress,
        ...(options.signal ? { loadSignal: options.signal } : {}),
      })

      loaded = { weights, model }
      return model
    } catch (error) {
      // The ADDON failing to open is an ordinary state on a machine nobody built for, and every
      // later compose reads it without paying for it again. A load the machine refused is not
      // that, and neither is an abort: both leave the addon perfectly usable, and `llama` set.
      refused = llama === null
      throw error
    }
  }

  // Everything but the last turn, briefing restored at the head: `setChatHistory` replaces what
  // the constructor seeded, while leaving the last user turn in makes `prompt` merge it twice.
  // Temperature stays zero by default because the assistant's structured answers are parsed.
  async function promptSession(session: LlamaChatSession, request: ChatRequest): Promise<string> {
    const briefing = request.messages.find(turn => turn.role === 'system')?.content
    const spoken = request.messages.filter(isSpoken)
    const earlier = spoken.slice(0, -1).map(historyItemOf)
    if (earlier.length > 0) {
      const head: ChatHistoryItem[] = briefing ? [{ type: 'system', text: briefing }] : []
      session.setChatHistory([...head, ...earlier])
    }
    return await session.prompt(spoken.at(-1)?.content ?? '', {
      temperature: request.temperature ?? 0,
      ...(request.topP === undefined ? {} : { topP: request.topP }),
      ...(request.maxTokens === undefined ? {} : { maxTokens: request.maxTokens }),
      ...(request.signal ? { signal: request.signal } : {}),
      ...(request.onProgress
        ? { onTextChunk: (delta: string) => request.onProgress?.({ delta }) }
        : {}),
      ...(request.json ? { grammar: await jsonGrammar() } : {}),
    })
  }

  // `contextTokens` is a ceiling: allocating the full 131,072-token training window would reserve
  // an attention cache of many gigabytes. The context owns that cache and must die after the turn;
  // the model stays loaded because reloading its weights per sentence defeats `keep_alive`.
  async function chat(request: ChatRequest, weights: string): Promise<string> {
    const { LlamaChatSession } = await import('node-llama-cpp')
    const model = await hold(weights, { onProgress: () => {} })
    const context: LlamaContext = await model.createContext({
      contextSize: { max: request.contextTokens },
    })
    try {
      const briefing = request.messages.find(turn => turn.role === 'system')?.content
      const session = new LlamaChatSession({
        contextSequence: context.getSequence(),
        systemPrompt: briefing,
      })
      return await promptSession(session, request)
    } finally {
      await context.dispose()
    }
  }

  return {
    ready: () => !refused,

    loaded: () => loaded?.weights ?? null,

    load: async (weights, options) => (await hold(weights, options)).size,

    unload: release,

    /**
     * `[M]` 46 ms to open the addon on this machine, 0 ms to read — paid once per process, and
     * what it buys is a verdict instead of a guess: without it every candidate reads `unknown`
     * until somebody has spoken to the assistant.
     */
    vram: async () => {
      if (refused) return null

      try {
        const state = await (await require()).getVramState()
        // Reported as it stands, zeroes included: what an empty reading MEANS is the probe's to
        // decide, and deciding it twice is how the two answers drift.
        return { totalBytes: state.total, freeBytes: state.free, unifiedBytes: state.unifiedSize }
      } catch {
        // A machine nobody built a binary for. Remembered, or every compose reopens the same
        // failure — and answered as an absence, which is what the probe falls back from.
        refused = true
        return null
      }
    },

    chat,
  }
}
