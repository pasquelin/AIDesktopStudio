import { orElse } from '@shared/promises'
import { create } from 'zustand'
import {
  answeredByComposer,
  HISTORY_MAX,
  loadedWith,
  refused,
  type ActionName,
  type AskedAnswer,
  type AskedQuestion,
  type AssistantAsk,
  type AssistantAnswer,
  type AssistantCall,
  type AssistantModel,
  type AssistantProgress,
  type AssistantWindow,
} from '@shared/domain/assistant'
import { assistantStepsWithin } from '@shared/domain/assistantSteps'
import { narrowTargets, type Target } from '@shared/domain/target'
import type { ConfirmAnswer, ConfirmRequest } from '@/features/assistant/confirm'
import type { runConfirmedAction } from '@/features/assistant/executor'
import {
  assistantHistory,
  alreadySettled,
  repeatedRelative,
  repeatKeyOf,
  settledKeyOf,
  resultLine,
  type AssistantAsked,
  type AssistantStep,
  type AssistantTurn,
} from '@/features/assistant/components/Assistant/Conversation/conversation'
import { revealChat } from '@/features/assistant/components/Assistant/Toast/revealChat'
import { noteAssistant } from '@/features/assistant/noteAssistant'
import { closeTool } from '@/helpers/revealPanel'
import { traceFailure } from '@/services/diagnostics'
import { getBridge } from '@/services/bridge'
import { useSettings } from './settings'

const STREAM_TAIL = 240

const NOTHING_WRITTEN = { streamed: '' }

const NOTHING_READ = {
  ...NOTHING_WRITTEN,
  promptTokens: 0,
  promptChars: 0,
  replyTokens: 0,
  windowTokens: 0,
}

type AssistantQuestion = {
  id: number
  request: ConfirmRequest
  answer: (given: ConfirmAnswer) => void
}

export type AssistantChoiceQuestion = AssistantAsk & {
  id: number
  answer: (given: readonly AskedAnswer[] | null) => void
}

type AssistantState = {
  turns: AssistantTurn[]
  busy: boolean
  round: number
  stopping: boolean
  streamed: string
  promptTokens: number
  replyTokens: number
  promptChars: number
  windowTokens: number
  door: AssistantWindow | null | undefined
  noteDoor: (door: AssistantWindow | null | undefined) => void
  noteProgress: (progress: AssistantProgress) => void
  stop: () => void
  asked: AssistantQuestion | null
  choosing: AssistantChoiceQuestion | null
  queued: readonly AssistantChoiceQuestion[]
  askChoice: (questions: readonly AskedQuestion[]) => Promise<readonly AskedAnswer[] | null>
  choose: (given: readonly AskedAnswer[] | null) => void
  spent: number
  draft: string
  setDraft: (draft: string) => void
  staged: number
  hearing: boolean
  stage: () => () => void
  seen: number
  markSeen: () => void
  say: (utterance: string) => Promise<void>
  ask: (request: ConfirmRequest) => Promise<ConfirmAnswer>
  answer: (granted: boolean, input?: Record<string, unknown>) => void
  setModel: (model: AssistantModel) => void
}

/**
 * Turns are keyed by this rather than by their index: the list only ever grows today, and a key
 * that is an index is the one that goes wrong the day it stops.
 */
let lastTurnId = 0

let lastAskId = 0

/**
 * Loaded on the turn, as the handler table is: it reaches the space modules, which
 * `eager-graph.test.ts` holds out of what a launch pays for. Narrowed against the sentence — a
 * stack of two hundred layers would spend the room the sentence itself needs.
 */
async function targetsFor(said: string): Promise<readonly Target[]> {
  const { frontTargets } = await import('@/features/assistant/documentTargets')
  return narrowTargets(frontTargets()?.targets() ?? [], said)
}

export const useAssistant = create<AssistantState>()((set, get) => ({
  turns: [],
  busy: false,
  round: 0,
  stopping: false,
  door: undefined,
  ...NOTHING_READ,
  asked: null,
  choosing: null,
  queued: [],
  spent: 0,
  seen: 0,
  draft: '',
  staged: 0,
  hearing: false,

  setDraft: draft => set({ draft }),

  noteDoor: door => set({ door }),

  noteProgress: progress =>
    set(state => ({
      // 🛑 Cut HERE and not at the render: only the tail is ever shown, and slicing a rope that
      // has grown by one token flattens it — `[M]` 6,6 ms per frame at 8 000 tokens, 65,8 at
      // 32 000. A restart still keeps what follows it, both arriving in one coalesced frame.
      streamed: ((progress.restart === true ? '' : state.streamed) + progress.delta).slice(
        -STREAM_TAIL,
      ),
      // Zero on a restart: what the attempt just thrown away cost is not what this one costs.
      promptTokens: progress.promptTokens ?? (progress.restart === true ? 0 : state.promptTokens),
      promptChars: progress.promptChars ?? (progress.restart === true ? 0 : state.promptChars),
      replyTokens: progress.replyTokens ?? (progress.restart === true ? 0 : state.replyTokens),
      windowTokens: progress.windowTokens ?? state.windowTokens,
    })),

  stage: () => {
    set(state => ({ staged: state.staged + 1, seen: state.busy ? state.seen : lastSeen(state) }))

    return () => set(state => ({ staged: state.staged - 1 }))
  },

  markSeen: () => set(state => ({ seen: lastSeen(state) })),

  ask: request =>
    new Promise<ConfirmAnswer>(resolve => {
      if (get().asked || get().choosing) {
        resolve({ granted: false, input: request.input ?? {} })
        return
      }

      // Measured 2026-08-30: an omitted input made the dynamically loaded confirmer throw.
      const asked = {
        id: (lastAskId += 1),
        request: { ...request, input: request.input ?? {} },
        answer: resolve,
      }
      set(state => ({ seen: lastSeen(state), asked }))
    }),

  askChoice: questions =>
    new Promise<readonly AskedAnswer[] | null>(resolve => {
      const asking = { id: (lastAskId += 1), questions, answer: resolve }
      set(state =>
        state.choosing || state.asked
          ? { queued: [...state.queued, asking] }
          : { seen: lastSeen(state), choosing: asking },
      )
    }),

  choose: given => {
    const choosing = get().choosing
    if (!choosing) return

    set(showNext)
    choosing.answer(given)
  },

  answer: (granted, input) => {
    const asked = get().asked
    if (!asked) return

    set(state => (state.choosing ? { asked: null } : { asked: null, ...showNext(state) }))
    asked.answer({ granted, input: input ?? asked.request.input })
  },

  stop: () => {
    if (!get().busy) return

    set({ stopping: true })
    const { choosing, queued } = get()
    set({ choosing: null, queued: [] })
    for (const one of [...(choosing ? [choosing] : []), ...queued]) one.answer(null)
    // 🛑 Both halves: the flag ends the CHAIN between two rounds, and this ends the round in
    // flight — a local model holds one for minutes at full tilt. Swallowed with a word, never
    // bare: a rejected channel is an unhandled rejection, and there is nothing to await here.
    void getBridge()
      ?.assistant.stop()
      .catch(reason => traceFailure('shell.dropped', 'assistant stop', reason))
  },

  say: async utterance => {
    const said = utterance.trim()
    if (said === '') return

    const choosing = get().choosing
    if (choosing && answeredByComposer(choosing.questions)) {
      get().choose([{ answer: said }])
      return
    }

    if (get().busy) return

    const id = (lastTurnId += 1)
    const turn: AssistantTurn = { id, said, answered: '', steps: [], asks: [], lost: false }
    set(state => ({
      turns: [...state.turns, turn],
      busy: true,
      stopping: false,
      round: 0,
      ...NOTHING_READ,
    }))

    const targets = await orElse(targetsFor(said), [])

    try {
      await chainOn(set, get, id, said, targets)
    } finally {
      set({ busy: false, stopping: false, round: 0, ...NOTHING_WRITTEN })
    }

    if (get().staged > 0) set({ seen: id })
  },

  setModel: model => {
    void useSettings.getState().setValue('assistant.model', model)
  },
}))

type Setter = (
  patched: Partial<AssistantState> | ((state: AssistantState) => Partial<AssistantState>),
) => void
type Getter = () => AssistantState

async function chainOn(
  set: Setter,
  get: Getter,
  id: number,
  said: string,
  targets: readonly Target[],
): Promise<void> {
  const ceiling = assistantStepsWithin(useSettings.getState().settings.assistant.steps)
  let loaded: readonly ActionName[] = []

  for (let round = 1; round <= ceiling; round += 1) {
    set({ round, ...NOTHING_WRITTEN })
    const answer = await answerFor(get, said, targets, loaded, round)
    if (!answer) {
      patch(set, id, get().stopping ? { ending: 'stopped' } : { lost: true })
      return
    }
    loaded = loadedWith(loaded, answer.loaded ?? [])
    if (!(await continueAfterAnswer(set, get, id, round, answer))) return
  }
  patch(set, id, { ending: 'halted' })
}

async function answerFor(
  get: Getter,
  said: string,
  targets: readonly Target[],
  loaded: readonly ActionName[],
  round: number,
): Promise<AssistantAnswer | null> {
  const turns = get().turns
  const history = assistantHistory((round === 1 ? turns.slice(0, -1) : turns).slice(-HISTORY_MAX))
  return await orElse(
    getBridge()?.assistant.think({
      utterance: said,
      history,
      targets,
      loaded,
      continuing: round > 1,
    }),
    null,
  )
}

async function continueAfterAnswer(
  set: Setter,
  get: Getter,
  id: number,
  round: number,
  answer: AssistantAnswer,
): Promise<boolean> {
  set(state => ({ spent: state.spent + answer.cost }))
  patch(set, id, { answered: alsoSaid(get(), id, answer.say) })
  if (answer.ask) return await parkedOn(set, get, id, answer.ask)
  if (answer.calls.length === 0) {
    if (round === 1 && answer.say !== '') {
      patch(set, id, { nudged: true })
      return true
    }
    patch(set, id, { lost: answer.say === '' && round === 1 })
    return false
  }
  if (!(await ranAll(set, get, id, answer.calls))) return false
  if (answer.calls.some(call => call.action === 'chat.close') && !get().asked)
    closeTool('assistant')
  if (!get().stopping) return true
  patch(set, id, { ending: 'stopped' })
  return false
}

function showNext(state: AssistantState): Partial<AssistantState> {
  const [next, ...rest] = state.queued

  return next ? { choosing: next, queued: rest, seen: lastSeen(state) } : { choosing: null }
}

/**
 * Puts the question on screen and waits on it. Answers whether the chain may go on — the answers
 * written on the TURN, which is the history the next round reads.
 */
async function parkedOn(set: Setter, get: Getter, id: number, ask: AssistantAsk): Promise<boolean> {
  /**
   * 🛑 For effect, never for its answer — a review asked for the opposite and it is wrong here:
   * `revealChat` says false wherever no shell is mounted, which is the BENCH, and refusing there
   * would end every asking turn of `pnpm banc` as stopped. What the deleted `chat.ask` guarded by
   * `noConfirmer` is guarded by reachability instead: `say` is only called from a surface that
   * has a shell, or from the bench, which answers through the store.
   */
  revealChat()

  const given = await get().askChoice(ask.questions)
  // One entry per question, dismissal included: a questionnaire answered by halves is still a
  // questionnaire, and the round after it reads what came back question by question.
  const asks = ask.questions.map((one, at) => askedOf(one, given?.[at], given === null))
  for (const asked of asks) {
    noteAssistant({
      kind: 'asked',
      question: asked.question,
      answer: asked.answer,
      ...(asked.note === undefined ? {} : { note: asked.note }),
    })
  }
  set(state => ({
    turns: state.turns.map(turn =>
      turn.id === id ? { ...turn, asks: [...turn.asks, ...asks] } : turn,
    ),
  }))

  // 🛑 Dismissing ENDS the turn, which is what the button promises: read as an ordinary answer,
  // the model was handed nothing and asked again on the next BILLED round. A stop pressed while
  // the question stood arrives the same way, `stop` settling it with nothing.
  if (given !== null && !get().stopping) return true

  patch(set, id, { ending: 'stopped' })
  return false
}

const askedOf = (
  asked: AskedQuestion,
  given: AskedAnswer | undefined,
  dismissed: boolean,
): AssistantAsked => ({
  question: asked.question,
  answer: given?.answer ?? null,
  ...(given?.note ? { note: given.note } : {}),
  ...(dismissed ? { dismissed: true } : {}),
})

function alsoSaid(state: AssistantState, id: number, say: string): string {
  const before = state.turns.find(turn => turn.id === id)?.answered ?? ''
  if (say.trim() === '') return before

  return before === '' ? say : `${before}\n${say}`
}

async function ranAll(
  set: Setter,
  get: Getter,
  id: number,
  calls: readonly AssistantCall[],
): Promise<boolean> {
  const steps: AssistantStep[] = [...(get().turns.find(turn => turn.id === id)?.steps ?? [])]

  try {
    const { runConfirmedAction } = await import('@/features/assistant/executor')

    for (const call of calls) {
      if (get().stopping) {
        patch(set, id, { steps: [...steps], ending: 'stopped' })
        return false
      }
      steps.push(await runCall(runConfirmedAction, steps, call))
      patch(set, id, { steps: [...steps] })
    }
  } catch (error) {
    traceFailure('shell.dropped', 'assistant action lot', error)
    patch(set, id, { lost: true })
    return false
  }

  return true
}

type ActionRunner = typeof runConfirmedAction

async function runCall(
  run: ActionRunner,
  steps: readonly AssistantStep[],
  call: AssistantCall,
): Promise<AssistantStep> {
  const repeatKey = repeatKeyOf(call.action, call.input)
  const settledKey = settledKeyOf(call.action, call.input)
  // Measured 2026-08-30: one model repeated the same panel opening on three of four rounds.
  const repeated = repeatedRelative(steps, repeatKey)
    ? ALREADY_APPLIED
    : alreadySettled(steps, call.action, settledKey)
      ? ALREADY_SETTLED
      : null
  const outcome =
    repeated === null ? await run(call.action, call.input) : refused('badInput', repeated)
  noteCall(call, outcome)
  return stepFor(call, outcome, repeatKey, settledKey)
}

type ActionOutcome = Awaited<ReturnType<ActionRunner>>

function noteCall(call: AssistantCall, outcome: ActionOutcome): void {
  noteAssistant({
    kind: 'ran',
    action: call.action,
    input: JSON.stringify(call.input),
    answer: outcome.ok ? resultLine(outcome.data) : outcome.refusal,
    refused: !outcome.ok,
  })
}

function stepFor(
  call: AssistantCall,
  outcome: ActionOutcome,
  repeatKey: string | null,
  settledKey: string | null,
): AssistantStep {
  return {
    action: call.action,
    refusal: outcome.ok ? null : outcome.refusal,
    ...(!outcome.ok && outcome.detail !== undefined ? { detail: outcome.detail } : {}),
    ...(outcome.ok && repeatKey !== null ? { repeatKey } : {}),
    ...(outcome.ok && settledKey !== null ? { settledKey } : {}),
    ...(outcome.ok && outcome.data !== undefined ? { data: outcome.data } : {}),
  }
}

function lastSeen(state: Pick<AssistantState, 'turns'>): number {
  return state.turns.at(-1)?.id ?? 0
}

/**
 * 🛑 It points at the ANSWER, and it may: the guard only fires on a step that RAN, and `blockOf`
 * writes every such step back into the history as « You ran X. It answered: … ». Told merely that
 * the call had already run, the model re-ran the reading call instead of reading what came back —
 * 23 refusals of the pass of 2026-08-31.
 */
const ALREADY_SETTLED =
  'that exact call already ran in this turn and left the studio in the state it asked for. Its ' +
  'answer is written above in this conversation — read it there and take the next step, rather ' +
  'than asking for it again.'

const ALREADY_APPLIED =
  'this turn already moved that very field of that very thing, by a relative amount. A second ' +
  'one lands ON TOP of the first, whatever figure it carries — what it answered is written ' +
  'above in this conversation: read the value that stands there, and change it absolutely if ' +
  'it is wrong.'

function patch(
  set: (updater: (state: AssistantState) => Partial<AssistantState>) => void,
  id: number,
  fields: Partial<AssistantTurn>,
): void {
  set(state => ({
    turns: state.turns.map(turn => (turn.id === id ? { ...turn, ...fields } : turn)),
  }))
}
