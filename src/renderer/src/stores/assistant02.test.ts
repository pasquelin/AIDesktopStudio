import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ActionName,
  ActionOutcome,
  AssistantAnswer,
  AssistantThought,
} from '@shared/domain/assistant'
import { installFakeBridge } from '@/services/fakeBridge'
import { useSettings } from './settings'
import { useAssistant } from './assistant'

/** The ceiling a case is about, without waiting for twelve rounds to reach it. */
function chainCeiling(steps: number): void {
  useSettings.setState(state => ({
    settings: { ...state.settings, assistant: { ...state.settings.assistant, steps } },
  }))
}

/** The identity of "the brain has not been called yet", so the wait has something to compare. */
const NOT_ASKED_YET = (): void => {}

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

describe('saying something to the assistant', () => {
  it('keeps what was said and what came back', async () => {
    // A second, silent round: an opening answer with no call is sent back once — see `NUDGE`.
    brain(answer(), answer({ say: '' }))
    await useAssistant.getState().say('  ouvre un fichier 3D  ')

    const [turn] = useAssistant.getState().turns
    expect(turn?.said).toBe('ouvre un fichier 3D')
    expect(turn?.answered).toBe('J’ouvre un fichier 3D.')
    expect(useAssistant.getState().busy).toBe(false)
  })

  /**
   * 🛑 Dictation sends the SPOKEN words, not the field. Emptying it here destroyed whatever was
   * half-typed beside them — the composer clears its own, which is the only path that knows the
   * two are the same text.
   */
  it('leaves the field alone, so a spoken sentence does not eat a typed one', async () => {
    brain()
    useAssistant.setState({ draft: 'génère une image de ' })

    await useAssistant.getState().say('un casque')

    expect(useAssistant.getState().draft).toBe('génère une image de ')
  })

  it('carries the turns before it, and never the one being said', async () => {
    const { asked } = brain()
    await useAssistant.getState().say('ouvre un fichier 3D')
    await useAssistant.getState().say('et maintenant génère')

    expect(asked[0]?.history).toEqual([])
    expect(asked[1]?.history).toHaveLength(1)
    expect(asked[1]?.history[0]).toContain('ouvre un fichier 3D')
  })

  /** The whole reason the total is on screen: five turns cost about what one picture does. */
  it('adds up what the thinking cost, round after round', async () => {
    brain(answer({ cost: 0.75 }), answer({ say: '', cost: 1 }))
    await useAssistant.getState().say('une')

    expect(useAssistant.getState().spent).toBe(1.75)
  })

  /**
   * In order, and this is the one that matters: `generator.prepare` fills the form that
   * `generator.submit` then sends, so a plan run at once would send an empty one.
   */
  it('runs the actions one after another, and records what each one did', async () => {
    const order: ActionName[] = []
    runConfirmedAction.mockImplementation(name => {
      order.push(name)
      return Promise.resolve(
        name === 'generator.submit' ? { ok: false, refusal: 'declined' } : { ok: true },
      )
    })

    brain(
      answer({
        calls: [
          { action: 'generator.prepare', input: {} },
          { action: 'generator.submit', input: {} },
        ],
      }),
    )
    await useAssistant.getState().say('génère un casque')

    expect(order).toEqual(['generator.prepare', 'generator.submit'])
    expect(useAssistant.getState().turns[0]?.steps).toEqual([
      { action: 'generator.prepare', refusal: null },
      { action: 'generator.submit', refusal: 'declined' },
    ])
  })

  // Two plans over one generator form, and a question on screen belonging to neither.
  it('ignores a second sentence while the first is still running', async () => {
    let release = NOT_ASKED_YET
    installFakeBridge({
      assistant: {
        think: () =>
          new Promise<AssistantAnswer>(resolve => {
            release = () => resolve(answer({ say: '' }))
          }),
      },
    })

    const first = useAssistant.getState().say('une')
    await useAssistant.getState().say('deux')
    expect(useAssistant.getState().turns).toHaveLength(1)

    // Awaited rather than called straight away: the turn reaches `think` a few microtasks in —
    // it loads the target table first — and releasing before that leaves the promise hanging.
    await vi.waitFor(() => expect(release).not.toBe(NOT_ASKED_YET))
    release()
    await first
  })

  it('marks a turn that came to nothing, rather than showing an empty answer', async () => {
    brain(answer({ say: '', calls: [], cost: 1.5 }))
    await useAssistant.getState().say('fais quelque chose d’impossible')

    expect(useAssistant.getState().turns[0]?.lost).toBe(true)
    // Spent all the same: the model was asked twice and both attempts were billed.
    expect(useAssistant.getState().spent).toBe(1.5)
  })

  /**
   * Every branch of the executor reaches an IPC channel that genuinely rejects — the API client
   * turns a 429, a missing key or a dropped network into a thrown error. Unguarded, one such
   * throw left `busy` true for the rest of the session: field disabled, spinner turning, nothing
   * on screen saying why.
   */
  it('does not seize up when an action throws', async () => {
    runConfirmedAction.mockRejectedValue(new Error('the network is gone'))
    brain(answer({ calls: [{ action: 'models.search', input: { query: 'casque' } }] }))

    await useAssistant.getState().say('cherche un casque')

    expect(useAssistant.getState().busy).toBe(false)
    expect(useAssistant.getState().turns[0]?.lost).toBe(true)
  })

  it('says so rather than hanging when the studio does not answer at all', async () => {
    installFakeBridge({ assistant: { think: () => Promise.reject(new Error('closed')) } })
    await useAssistant.getState().say('ouvre un fichier 3D')

    expect(useAssistant.getState().turns[0]?.lost).toBe(true)
    expect(useAssistant.getState().busy).toBe(false)
  })
})

describe('the question asked before anything is engaged', () => {
  // Whoever is staging the thread shows it: the shell brings a host up before asking, so the
  // store's job is to hold the one question and the promise waiting on it.
  it('waits on the surface staging the thread', async () => {
    const unstage = useAssistant.getState().stage()
    const asked = useAssistant
      .getState()
      .ask({ action: 'generator.submit', input: {}, commitment: 'credits' })

    expect(useAssistant.getState().asked?.request.action).toBe('generator.submit')

    useAssistant.getState().answer(true)
    await expect(asked).resolves.toMatchObject({ granted: true })
    unstage()
  })

  /**
   * 🛑 It WAITS rather than being declined: the two hosts hand over in one commit — opening a
   * document, going Home — and the panel arrives a few frames later, so declining on the way
   * refused questions nobody had been shown.
   */
  it('outlives the surface showing it, for the next one to show', async () => {
    const unstage = useAssistant.getState().stage()
    const asked = useAssistant
      .getState()
      .ask({ action: 'generator.submit', input: {}, commitment: 'credits' })
    unstage()

    expect(useAssistant.getState().asked?.request.action).toBe('generator.submit')

    useAssistant.getState().stage()
    useAssistant.getState().answer(true)
    await expect(asked).resolves.toMatchObject({ granted: true })
  })

  /**
   * The two callers of the gate are independent — the modal's own plan, and an MCP client on the
   * other side of the machine — so two questions can genuinely be in flight. Overwriting the
   * first cost twice: its promise never settled, holding `busy` for the session, and the buttons
   * on screen then answered the SECOND request while the person was reading the first. A yes
   * meant for "this uploads an image, it is free" would have started a paid generation.
   */
  it('refuses a second question rather than replacing the one on screen', async () => {
    const first = useAssistant
      .getState()
      .ask({ action: 'command.runStudioCommand', input: {}, commitment: 'asset' })
    const second = useAssistant
      .getState()
      .ask({ action: 'generator.submit', input: {}, commitment: 'credits' })

    await expect(second).resolves.toMatchObject({ granted: false })
    expect(useAssistant.getState().asked?.request.action).toBe('command.runStudioCommand')

    useAssistant.getState().answer(true)
    await expect(first).resolves.toMatchObject({ granted: true })
  })
})

/**
 * The chain, which is what turns one sentence into work: an action's INPUT is often only known
 * once the one before it has answered — search a name, open what came back — and a single plan
 * written in advance cannot say it. Every round is a billed round trip, so what ends one is as
 * much the point as what continues it.
 */
describe('chaining rounds on one sentence', () => {
  const searched = answer({ say: 'Je cherche.', calls: [{ action: 'files.search', input: {} }] })
  const done = answer({ say: 'Voici le voilier vert.', calls: [] })

  /**
   * 🛑 Defect 1: the manuals a round opened are the WINDOW's to carry — the main process keeps
   * nothing between two turns. Without this every round reopened the same fields, at a billed
   * round trip each, and a model that had just been given `files.search` was blind to it again.
   */
  it('hands back the manuals a round opened, so the next round starts with them', async () => {
    runConfirmedAction.mockResolvedValue({ ok: true, data: [] })
    const { asked } = brain({ ...searched, loaded: ['files.search'] }, done)

    await useAssistant.getState().say('cherche le voilier vert')

    expect(asked[0]?.loaded).toEqual([])
    expect(asked[1]?.loaded).toEqual(['files.search'])
  })

  /**
   * 🛑 And they die WITH the chain: kept across sentences they would grow to the whole registry,
   * which is the 90 994-character briefing this whole mechanism replaced.
   */
  it('starts the next sentence with nothing open', async () => {
    runConfirmedAction.mockResolvedValue({ ok: true, data: [] })
    const { asked } = brain({ ...searched, loaded: ['files.search'] }, done, done)

    await useAssistant.getState().say('cherche le voilier vert')
    await useAssistant.getState().say('et maintenant')

    expect(asked[1]?.loaded).toEqual(['files.search'])
    expect(asked[2]?.loaded).toEqual([])
  })

  it('asks again with what the action answered, so the next call can use it', async () => {
    runConfirmedAction.mockResolvedValue({ ok: true, data: ['Images/Voilier vert.png'] })
    const { asked } = brain(searched, done)

    await useAssistant.getState().say('ouvre le voilier vert')

    expect(asked).toHaveLength(2)
    expect(asked[1]?.continuing).toBe(true)
    // The path is IN what the second round reads: without it the model asks for the same search.
    expect(asked[1]?.history.join('\n')).toContain('Images/Voilier vert.png')
  })

  /**
   * 🛑 THREE rounds, not two, and that is the whole point of the case: `patch` replaces what a
   * turn holds, so a round that started its list at zero wiped the round before it. The search
   * result left the history and the model ran the search it had already run — the one failure
   * the chain exists to remove — while two rounds stayed green throughout.
   */
  it('keeps what earlier rounds did, so a third round still reads the first', async () => {
    runConfirmedAction.mockResolvedValue({ ok: true, data: ['Images/Voilier vert.png'] })
    const opened = answer({ say: 'Je l’ouvre.', calls: [{ action: 'file.open', input: {} }] })
    const { asked } = brain(searched, opened, done)

    await useAssistant.getState().say('ouvre le voilier vert')

    expect(useAssistant.getState().turns[0]?.steps.map(step => step.action)).toEqual([
      'files.search',
      'file.open',
    ])
    expect(asked[2]?.history.join('\n')).toContain('files.search')
  })

  // The same wipe seen from the person's side: several actions ran and were not undone, and the
  // turn reported none of them.
  it('keeps the steps that ran when the chain is stopped', async () => {
    const opened = answer({ say: 'Je l’ouvre.', calls: [{ action: 'file.open', input: {} }] })
    brain(searched, opened, done)
    runConfirmedAction.mockImplementation(async () => {
      if (useAssistant.getState().round === 2) useAssistant.getState().stop()
      return { ok: true }
    })

    await useAssistant.getState().say('ouvre le voilier vert')

    expect(useAssistant.getState().turns[0]?.steps).toHaveLength(2)
    expect(useAssistant.getState().turns[0]?.ending).toBe('stopped')
  })

  // The only way a model says a request is done — and the way it asks a question, its `say`
  // being what the person answers next.
  it('stops as soon as the model answers with no calls', async () => {
    const { asked } = brain(searched, done, searched)

    await useAssistant.getState().say('ouvre le voilier vert')

    expect(asked).toHaveLength(2)
    expect(useAssistant.getState().turns[0]?.ending).toBeUndefined()
  })

  // Every round's sentence, not just the last: "I am looking" then "here it is" is the chain as
  // the person watched it happen.
  it('keeps what was said at each round', async () => {
    brain(searched, done)

    await useAssistant.getState().say('ouvre le voilier vert')

    expect(useAssistant.getState().turns[0]?.answered).toBe('Je cherche.\nVoici le voilier vert.')
  })

  /**
   * 🛑 The one thing between a chain and a bill: a model that keeps asking for the same action
   * would run until somebody noticed. Cut here, a chain reads exactly like one that finished —
   * so the turn SAYS it was cut.
   */
  it('stops at the ceiling, and says it was cut rather than finished', async () => {
    chainCeiling(2)
    const { asked } = brain(searched, searched, searched, searched)

    await useAssistant.getState().say('ouvre le voilier vert')

    expect(asked).toHaveLength(2)
    expect(useAssistant.getState().turns[0]?.ending).toBe('halted')
  })

  it('stops between two actions when asked to, leaving what ran alone', async () => {
    const twice = answer({
      calls: [
        { action: 'files.search', input: {} },
        { action: 'file.open', input: {} },
      ],
    })
    runConfirmedAction.mockImplementation(async () => {
      useAssistant.getState().stop()
      return { ok: true }
    })
    brain(twice, done)

    await useAssistant.getState().say('ouvre le voilier vert')

    const turn = useAssistant.getState().turns[0]
    // The first ran and is kept; the second never started.
    expect(turn?.steps.map(step => step.action)).toEqual(['files.search'])
    expect(turn?.ending).toBe('stopped')
    expect(useAssistant.getState().stopping).toBe(false)
  })

  // Nothing to stop is nothing to arm: a flag left set would refuse the NEXT sentence a round.
  it('ignores a stop asked for while idle', () => {
    useAssistant.getState().stop()

    expect(useAssistant.getState().stopping).toBe(false)
  })
})
