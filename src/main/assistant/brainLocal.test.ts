import { describe, expect, it } from 'vitest'
import type { ChatRequest } from '@main/ai/localRuntimes'
import { createLocalBrain } from './brainLocal'

const brainAnswering = (answers: readonly string[], contextTokens = 8192) => {
  const asked: ChatRequest[] = []
  let turn = 0

  const chat = (request: ChatRequest) => {
    asked.push(request)
    return Promise.resolve(answers[turn++] ?? '')
  }

  return {
    brain: createLocalBrain({ chat, modelId: 'llama3.2:3b', contextTokens }),
    asked,
  }
}

const briefingOf = (asked: readonly ChatRequest[]): string =>
  String(asked[0]?.messages.find(turn => turn.role === 'system')?.content)

const REPLY = '{"say":"Opening it.","calls":[]}'

describe('the local brain', () => {
  it('reads the answer the model wrote', async () => {
    const { brain } = brainAnswering([REPLY])

    await expect(brain.think({ utterance: 'open the 3d space', history: [] })).resolves.toEqual({
      say: 'Opening it.',
      calls: [],
      cost: 0,
    })
  })

  /** Asked before a turn, so the composer shows the bound with nothing typed yet. */
  it('names its window in tokens, capped to what one turn is worth', async () => {
    const { brain } = brainAnswering([REPLY], 262_144)

    expect(await brain.window()).toEqual({ size: 8192, unit: 'tokens', assumed: false })
  })

  /**
   * 🛑 `[M]` A huge window is not an invitation to fill it: 262 144 composed a 90 298-character
   * briefing, ~30 100 tokens re-read on every round of the chain, for five minutes on one
   * sentence. The names of all 283 run to 4 225, and the manuals are paid for when asked.
   */
  it('is shown the names however large its window, and no manual it did not ask for', async () => {
    const { brain, asked } = brainAnswering([REPLY], 262_144)

    await brain.think({ utterance: 'hello', history: [] })

    expect(briefingOf(asked)).toContain('git.checkout')
    expect(briefingOf(asked)).not.toContain('  git.checkout —')
  })

  /**
   * `project.create` takes an ABSOLUTE path and the briefing spelled none, so the model answered
   * "what is your login name?" to a request it could otherwise have run.
   */
  it('shows the model where this machine keeps its folders', async () => {
    const { brain, asked } = brainAnswering([REPLY])

    await brain.think({
      utterance: 'hello',
      history: [],
      folders: 'downloads: /Users/someone/Downloads',
    })

    expect(briefingOf(asked)).toContain('downloads: /Users/someone/Downloads')
  })

  /**
   * 🛑 The window is CAPPED here, so nothing downstream can derive it: without it travelling with
   * the frames, the composer shows a count with nothing to read it against.
   */
  it('names the window its frames were read in', async () => {
    const seen: (number | undefined)[] = []
    const chat = (request: ChatRequest) => {
      request.onProgress?.({ delta: 'x', promptTokens: 2116 })
      return Promise.resolve(REPLY)
    }
    const brain = createLocalBrain({ chat, modelId: 'llama3.2:3b', contextTokens: 262_144 })

    await brain.think(
      { utterance: 'hello', history: [] },
      { onProgress: progress => seen.push(progress.windowTokens) },
    )

    // Both of them: the restart `answeredTurn` emits, and the frame the runtime wrote.
    expect(seen).toEqual([8192, 8192])
  })

  it('asks a huge model for the capped window rather than its own', async () => {
    const { brain, asked } = brainAnswering([REPLY], 262_144)

    await brain.think({ utterance: 'hello', history: [] })

    expect(asked[0]).toMatchObject({ contextTokens: 8192 })
  })

  it('carries the manuals the round before it opened', async () => {
    const { brain, asked } = brainAnswering([REPLY])

    await brain.think({ utterance: 'hello', history: [], loaded: ['git.checkout'] })

    expect(briefingOf(asked)).toContain('  git.checkout —')
  })

  /**
   * 🛑 The channel takes ten thousand characters and this window holds a third of that. An uncut
   * paste does not overflow itself: the runtime cuts from the HEAD, where the briefing sits, so
   * the loss lands on the instructions rather than on the paste — ADR-18.
   */
  it('cuts a long paste to its own window, leaving the briefing whole', async () => {
    // 4 096, which is what every Ollama model of the catalogue declares.
    const { brain, asked } = brainAnswering([REPLY], 4_096)

    await brain.think({ utterance: 'x'.repeat(10_000), history: [] })

    const said = String(asked[0]?.messages.at(-1)?.content)
    expect(said.length).toBeLessThan(10_000)
    expect(briefingOf(asked)).toContain('Catalogue:')
  })
})

describe('the local brain conversation', () => {
  it('asks the model for one JSON object, in the window its manifest declares', async () => {
    const { brain, asked } = brainAnswering([REPLY])

    await brain.think({ utterance: 'hello', history: [] })

    expect(asked[0]).toMatchObject({ model: 'llama3.2:3b', contextTokens: 8192, json: true })
  })

  /**
   * 🛑 The catalogue goes in a `system` turn and the sentence just typed is the LAST turn. Burying
   * it in the briefing had the model answer the turn before it — the cloud door does not have this
   * failure, because there the instruction is a field beside the inputs rather than one turn.
   */
  it('puts the briefing first and the sentence last', async () => {
    const { brain, asked } = brainAnswering([REPLY])

    await brain.think({ utterance: 'open the 3d space', history: ['earlier'] })

    const messages = asked[0]?.messages ?? []
    expect(messages[0]?.role).toBe('system')
    expect(messages[0]?.content).not.toContain('open the 3d space')
    expect(messages.slice(1)).toEqual([
      { role: 'user', content: 'earlier' },
      { role: 'user', content: 'open the 3d space' },
    ])
  })

  /**
   * 🛑 A runtime that overruns its window truncates silently and cuts from the HEAD, where the
   * preamble sits — ADR-18. The oldest turns are dropped HERE so the loss is ours to choose.
   */
  it('drops the oldest turns rather than letting the runtime eat the preamble', async () => {
    const { brain, asked } = brainAnswering([REPLY])

    await brain.think({ utterance: 'hello', history: ['x'.repeat(30_000), 'recent'] })

    expect(asked[0]?.messages.slice(1)).toEqual([
      { role: 'user', content: 'recent' },
      { role: 'user', content: 'hello' },
    ])
  })

  // The same one retry the cloud brain gets, and for the same reason: a model told only "that was
  // not JSON" tends to produce the same thing again, so it is shown what it sent.
  it('asks once more, quoting back what could not be read', async () => {
    const { brain, asked } = brainAnswering(['I would love to help!', REPLY])

    await expect(brain.think({ utterance: 'hello', history: [] })).resolves.toMatchObject({
      say: 'Opening it.',
    })
    expect(asked).toHaveLength(2)
    expect(JSON.stringify(asked[1]?.messages)).toContain('I would love to help!')
  })

  /**
   * Invariant 6: a turn run in this process generates to its ceiling, and a window closed
   * mid-answer would leave it running with nobody to read it. The signal is what stops it, and it
   * has to reach the runtime — not merely be accepted at the top.
   */
  it('hands the runtime what stops a turn nobody is waiting for any more', async () => {
    const { brain, asked } = brainAnswering([REPLY])
    const abort = new AbortController()

    await brain.think({ utterance: 'hello', history: [] }, { signal: abort.signal })

    expect(asked[0]?.signal).toBe(abort.signal)
  })

  /**
   * 🛑 A stop is not a failed attempt to swallow: swallowed, the turn answers an empty sentence
   * and the window reads it as LOST rather than as stopped.
   */
  it('raises rather than answering empty when the stop lands on the second attempt', async () => {
    let turn = 0
    const abort = () => {
      const error = new Error('aborted')
      error.name = 'AbortError'
      return error
    }
    const brain = createLocalBrain({
      chat: () => (turn++ === 0 ? Promise.resolve('not json') : Promise.reject(abort())),
      modelId: 'llama3.2:3b',
      contextTokens: 8192,
    })

    await expect(brain.think({ utterance: 'hello', history: [] })).rejects.toThrow(/aborted/)
  })

  // A person is waiting, and "I did not understand" beats a stack trace.
  it('says nothing rather than raising when two attempts are both unreadable', async () => {
    const { brain } = brainAnswering(['nope', 'still nope'])

    await expect(brain.think({ utterance: 'hello', history: [] })).resolves.toEqual({
      say: '',
      calls: [],
      unreadable: true,
      cost: 0,
    })
  })
})
