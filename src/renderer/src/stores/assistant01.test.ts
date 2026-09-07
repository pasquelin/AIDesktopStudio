import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ActionName,
  ActionOutcome,
  AssistantAnswer,
  AssistantAsk,
  AssistantThought,
} from '@shared/domain/assistant'
import type { AssistantNote } from '@shared/domain/assistantNote'
import { installFakeBridge } from '@/services/fakeBridge'
import { useSettings } from './settings'
import { useAssistant } from './assistant'

/** One question, the ordinary shape — the questionnaire is `AssistantConversationChoice`'s case. */
const asking = (question: string, choices: readonly string[] = []): AssistantAsk => ({
  questions: [{ question, choices }],
})

/** The ceiling a case is about, without waiting for twelve rounds to reach it. */
function chainCeiling(steps: number): void {
  useSettings.setState(state => ({
    settings: { ...state.settings, assistant: { ...state.settings.assistant, steps } },
  }))
}

/**
 * The executor stands in: what each action does to the studio is its own suite's business, and
 * this one is about the order they run in and what the modal is told afterwards.
 */
const runConfirmedAction = vi.hoisted(() =>
  vi.fn<(name: ActionName, input: Record<string, unknown>) => Promise<ActionOutcome>>(),
)
vi.mock('@/features/assistant/executor', () => ({ runConfirmedAction }))

const answer = (fields: Partial<AssistantAnswer> = {}): AssistantAnswer => ({
  say: 'J’ouvre un fichier 3D.',
  calls: [],
  cost: 0.75,
  ...fields,
})

/** The bridge, with the one channel this store speaks on. Returns what the main process saw. */
function brain(...replies: AssistantAnswer[]): { asked: AssistantThought[] } {
  const asked: AssistantThought[] = []
  let turn = 0

  installFakeBridge({
    assistant: {
      think: (request: AssistantThought) => {
        asked.push(request)
        return Promise.resolve(replies[turn++] ?? answer())
      },
    },
  })

  return { asked }
}

beforeEach(() => {
  runConfirmedAction.mockReset()
  runConfirmedAction.mockResolvedValue({ ok: true })
  chainCeiling(12)
  useAssistant.setState({
    turns: [],
    busy: false,
    round: 0,
    stopping: false,
    asked: null,
    spent: 0,
    draft: '',
    staged: 0,
    streamed: '',
    promptTokens: 0,
    replyTokens: 0,
    windowTokens: 0,
  })
})

/** The bridge's note channel, gathering what the chain wrote rather than dropping it. */
const collecting =
  (notes: AssistantNote[]) =>
  (one: AssistantNote): Promise<void> => {
    notes.push(one)
    return Promise.resolve()
  }

describe('what a turn writes down', () => {
  /**
   * 🛑 Both sides of a turn in ONE order: the brain composes and reads in the main process, the
   * calls run here, and a reader following a turn cannot piece it together from two places.
   */
  it('notes each call and what the studio answered it', async () => {
    const notes: AssistantNote[] = []
    installFakeBridge({
      assistant: {
        think: () => Promise.resolve(answer({ calls: [{ action: 'jobs.list', input: {} }] })),
        note: collecting(notes),
      },
    })
    runConfirmedAction.mockResolvedValue({ ok: false, refusal: 'noProject' })
    chainCeiling(1)

    await useAssistant.getState().say('où en sont mes générations')

    expect(notes).toContainEqual({
      kind: 'ran',
      action: 'jobs.list',
      input: '{}',
      answer: 'noProject',
      refused: true,
    })
  })

  it('notes the question and what was answered', async () => {
    const notes: AssistantNote[] = []
    // Two answers, never one repeated: a door that asks for ever parks the chain on every round.
    const replies = [answer({ ask: asking('Quel nom ?'), calls: [] }), answer()]
    installFakeBridge({
      assistant: {
        think: () => Promise.resolve(replies.shift() ?? answer()),
        note: collecting(notes),
      },
    })

    const said = useAssistant.getState().say('crée un projet')
    await vi.waitFor(() => expect(useAssistant.getState().choosing).not.toBeNull())
    useAssistant.getState().choose([{ answer: 'Bateaux' }])
    await said

    expect(notes).toContainEqual({ kind: 'asked', question: 'Quel nom ?', answer: 'Bateaux' })
  })
})

/** Answers whatever question is standing, as a person pressing a button or typing would. */
async function answering(chosen: string | null): Promise<void> {
  await vi.waitFor(() => expect(useAssistant.getState().choosing).not.toBeNull())
  useAssistant.getState().choose(chosen === null ? null : [{ answer: chosen }])
}

describe('a question the model asked', () => {
  /**
   * 🛑 The defect this whole key exists for: asked to ask, a model asked AND acted in the same
   * breath — measured on qwen3.8, « Crée un nouveau projet » came back with the question in `say`
   * and `command.runStudioCommand` beside it, and both calls were run against a name nobody had given.
   */
  it('runs nothing of the round that asked', async () => {
    brain(answer({ say: '', ask: asking('Quel nom ?'), calls: [] }), answer({ calls: [] }))

    const said = useAssistant.getState().say('crée un projet')
    await answering('Bateaux')
    await said

    expect(runConfirmedAction).not.toHaveBeenCalled()
    expect(useAssistant.getState().turns[0]?.asks).toEqual([
      { question: 'Quel nom ?', answer: 'Bateaux' },
    ])
  })

  /** What the wait is worth: the answer reaches the round that asked for it, or it asks again. */
  it('carries the answer into the next round', async () => {
    const { asked } = brain(
      answer({ say: '', ask: asking('Quel nom ?'), calls: [] }),
      answer({ calls: [] }),
    )

    const said = useAssistant.getState().say('crée un projet')
    await answering('Bateaux')
    await said

    expect(asked).toHaveLength(2)
    expect(asked[1]?.history.join('\n')).toContain('the person answered: Bateaux')
  })

  /** The composer is the only way to answer a question with no choices — see `say`. */
  it('takes what is typed as the answer rather than as a new sentence', async () => {
    const { asked } = brain(
      answer({ say: '', ask: asking('Quel nom ?'), calls: [] }),
      answer({ calls: [] }),
    )

    const said = useAssistant.getState().say('crée un projet')
    await vi.waitFor(() => expect(useAssistant.getState().choosing).not.toBeNull())
    await useAssistant.getState().say('Bateaux')
    await said

    expect(useAssistant.getState().turns).toHaveLength(1)
    expect(asked[1]?.history.join('\n')).toContain('the person answered: Bateaux')
  })

  /**
   * 🛑 « Laisser tomber » ENDS the chain, which is what the button promises. Read as an ordinary
   * answer, the model was handed nothing and asked again on the next BILLED round.
   */
  it('ends the chain when the person lets the question go', async () => {
    const { asked } = brain(
      answer({ say: 'Où ?', ask: asking('Où ?', ['Image']), calls: [] }),
      answer(),
    )

    const said = useAssistant.getState().say('crée un projet')
    await answering(null)
    await said

    expect(useAssistant.getState().turns[0]).toMatchObject({ ending: 'stopped' })
    expect(asked).toHaveLength(1)
  })

  /**
   * 🛑 The chain parks inside the action while the card stands: unsettled by the stop, the field
   * stays disabled and Stop greys itself out — the only way out was answering the question one
   * had just asked to stop.
   */
  it('settles the question the stop is stopping', async () => {
    installFakeBridge({ assistant: { stop: () => Promise.resolve() } })
    useAssistant.setState({ busy: true })
    const answered = useAssistant.getState().askChoice([{ question: 'Où ?', choices: ['Image'] }])

    useAssistant.getState().stop()

    await expect(answered).resolves.toBeNull()
    expect(useAssistant.getState().choosing).toBeNull()
  })

  /** 🛑 The queued ones too: one left standing keeps its own chain waiting on a person who has
   * just asked everything to stop. */
  it('settles the question that was waiting behind it as well', async () => {
    installFakeBridge({ assistant: { stop: () => Promise.resolve() } })
    useAssistant.setState({ busy: true })
    const first = useAssistant.getState().askChoice([{ question: 'Où ?', choices: ['Image'] }])
    const waited = useAssistant.getState().askChoice([{ question: 'Et ensuite ?', choices: [] }])

    useAssistant.getState().stop()

    await expect(first).resolves.toBeNull()
    await expect(waited).resolves.toBeNull()
    expect(useAssistant.getState().choosing).toBeNull()
  })

  /** 🛑 The queue fills behind a CONFIRMATION too, which `choose` cannot see: draining through
   * the question on screen alone left those chains waiting on a person who had just stopped. */
  it('settles a question queued behind a confirmation', async () => {
    installFakeBridge({ assistant: { stop: () => Promise.resolve() } })
    useAssistant.setState({ busy: true })
    const granted = useAssistant
      .getState()
      .ask({ action: 'project.create', input: {}, commitment: 'studio' })
    const waited = useAssistant.getState().askChoice([{ question: 'Où ?', choices: [] }])

    useAssistant.getState().stop()

    await expect(waited).resolves.toBeNull()
    useAssistant.getState().answer(false)
    await granted
  })

  /**
   * 🛑 A line typed below says nothing about WHICH question it answers, so a questionnaire is
   * answered in its own card — and every answer reaches the round that asked for it.
   */
  it('does not take what is typed as the answer to a questionnaire', async () => {
    const { asked } = brain(
      answer({
        say: '',
        ask: {
          questions: [
            { question: 'Lequel ?', choices: [] },
            { question: 'Pourquoi ?', choices: [] },
          ],
        },
        calls: [],
      }),
      answer({ calls: [] }),
    )

    const said = useAssistant.getState().say('crée un projet')
    await vi.waitFor(() => expect(useAssistant.getState().choosing).not.toBeNull())
    await useAssistant.getState().say('Bateaux')

    expect(useAssistant.getState().choosing).not.toBeNull()
    useAssistant.getState().choose([{ answer: 'un bateau' }, { answer: 'pour voir' }])
    await said

    expect(asked[1]?.history.join('\n')).toContain(
      'You asked: Pourquoi ? — the person answered: pour voir',
    )
  })
})

describe('stopping a sentence', () => {
  /**
   * 🛑 Both halves: the flag ends the chain BETWEEN two rounds, and a local model holds one round
   * for minutes at full tilt — the flag alone left "stopping…" on screen with the fans up.
   */
  it('cuts the round in flight, not only the chain', () => {
    const stop = vi.fn(() => Promise.resolve())
    installFakeBridge({ assistant: { stop } })
    useAssistant.setState({ busy: true })

    useAssistant.getState().stop()

    expect(useAssistant.getState().stopping).toBe(true)
    expect(stop).toHaveBeenCalled()
  })

  it('reaches for nothing while nothing runs', () => {
    const stop = vi.fn(() => Promise.resolve())
    installFakeBridge({ assistant: { stop } })

    useAssistant.getState().stop()

    expect(stop).not.toHaveBeenCalled()
  })

  // Cut on purpose is not LOST: the person is the one who cut it, and "lost" reads as a failure.
  it('reads a cut round as stopped rather than as lost', async () => {
    installFakeBridge({
      assistant: {
        think: () => {
          useAssistant.getState().stop()
          return Promise.reject(new Error('aborted'))
        },
      },
    })

    await useAssistant.getState().say('hello')

    expect(useAssistant.getState().turns[0]).toMatchObject({ ending: 'stopped', lost: false })
  })
})

describe('watching the model write', () => {
  it('appends what arrives and keeps the counts the door reported', () => {
    const { noteProgress } = useAssistant.getState()
    noteProgress({ delta: '{"say":' })
    noteProgress({ delta: '"hi"}', promptTokens: 2366, replyTokens: 18 })

    expect(useAssistant.getState()).toMatchObject({
      streamed: '{"say":"hi"}',
      promptTokens: 2366,
      replyTokens: 18,
    })
  })

  /**
   * One sentence may cost four round trips, and a rejected answer is thrown away whole: appended
   * to the next, it reads as one long answer contradicting itself.
   */
  it('drops what a thrown-away attempt had written', () => {
    const { noteProgress } = useAssistant.getState()
    noteProgress({ delta: 'half an answ' })
    noteProgress({ delta: '', restart: true })
    noteProgress({ delta: 'the real one' })

    expect(useAssistant.getState().streamed).toBe('the real one')
  })

  /**
   * 🛑 The counts OUTLIVE the round: cleared with the streamed text they blinked to zero between
   * two rounds, and were gone the moment the composer had a reader for them.
   */
  it('keeps what the last round read once the turn is over', async () => {
    brain(answer({ say: 'done', calls: [] }))
    await useAssistant.getState().say('hello')
    useAssistant.getState().noteProgress({ delta: '', promptTokens: 2116, windowTokens: 8192 })

    expect(useAssistant.getState()).toMatchObject({ promptTokens: 2116, windowTokens: 8192 })
  })

  // A new SENTENCE starts them over: what the last turn read is not what this one will read.
  it('starts a new sentence from nothing read', async () => {
    brain(answer({ say: 'done', calls: [] }))
    useAssistant.setState({ promptTokens: 2116, windowTokens: 8192 })

    await useAssistant.getState().say('hello')

    expect(useAssistant.getState().promptTokens).toBe(0)
  })

  it('starts each round from nothing, so one round never reads as the next', async () => {
    brain(answer({ say: 'done', calls: [] }))
    useAssistant.setState({ streamed: 'left over', promptTokens: 99 })

    await useAssistant.getState().say('hello')

    expect(useAssistant.getState()).toMatchObject({ streamed: '', promptTokens: 0 })
  })
})
