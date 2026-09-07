import {
  ACTION_REGISTRY,
  assistantAction,
  DISCOVERY_ACTION,
  findActions,
  type ActionName,
  type AssistantAnswer,
  type AssistantProgress,
} from '@shared/domain/assistant'
import type { AssistantNote } from '@shared/domain/assistantNote'
import { OversizedRequest } from '@main/ai/cloudChat'
import { log } from '@main/log'
import type { TurnWatch } from './brainPort'
import type { Briefing } from './instruction'
import { recentHistory } from './instruction'
import { parseReply, readReply, type Reply, type ReplyFault } from './reply'

const REGISTERED_ACTIONS: ReadonlySet<ActionName> = new Set(
  ACTION_REGISTRY.map(action => action.name),
)

/**
 * 🛑 The person pressed stop. Raised rather than answered empty: an empty answer is UNREADABLE,
 * and a turn that reads one asks the door a second time — a second billed job for a turn nobody
 * is waiting for, reported as lost rather than as stopped.
 */
export class TurnStopped extends Error {}

/**
 * Relays a frame with the window it was read in — a door caps or budgets its own, and nothing
 * downstream can derive it. See `AssistantProgress.windowTokens`.
 */
export const inWindow =
  (onProgress: (progress: AssistantProgress) => void, windowTokens: number) =>
  (progress: AssistantProgress): void =>
    onProgress({ ...progress, windowTokens })

/** What one round trip came back with, and what it cost. Zero for a model on this machine. */
export type BrainAttempt = { answer: string; cost: number }

/** Where a turn's round trips are written down, and which door they went through. */
export type TurnNotes = { door: string; model: string; note: (note: AssistantNote) => void }

/** The same, or nothing where nobody is watching — written once for the three doors. */
export const notesFor = (door: string, model: string, watch: TurnWatch): TurnNotes | undefined =>
  watch.onNote && { door, model, note: watch.onNote }

/** One round trip against one briefing, complaint included — what every brain hands over. */
export type BrainRound = (briefing: Briefing, complaint?: string) => Promise<BrainAttempt>

/**
 * A stop, whichever door raised it — `TurnStopped` from a cancelled job, `AbortError` from a
 * `fetch` or a runtime cut mid-generation.
 */
const stopped = (error: unknown): boolean =>
  error instanceof TurnStopped ||
  (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError'))

/** Quoting the answer back is what works; bounded so an essay does not eat the history budget. */
function complaintAbout(answer: string, fault: ReplyFault): string {
  return [...faultLines(fault), 'This is what you sent:', answer.slice(0, 500)].join('\n')
}

function faultLines(fault: ReplyFault): readonly string[] {
  switch (fault.kind) {
    case 'unknownAction': {
      const closest = findActions(fault.name.replace(/[.:]/g, ' '))
        .slice(0, 5)
        .map(action => action.name)
      return [
        `Your previous answer named "${fault.name}", which is not an action of the catalogue, so`,
        'none of its calls ran. Use catalogue names only' +
          (closest.length > 0 ? `; the closest are ${closest.join(', ')}.` : '.'),
        'Send the whole answer again.',
      ]
    }
    case 'empty':
      return [
        'Your previous answer had neither a sentence nor a call. If the goal is reached, say so',
        'in "say"; otherwise send the calls.',
      ]
    default:
      return [
        'Your previous answer could not be read. It must be one JSON object with the keys "say",',
        '"ask" and "calls", and nothing else around it.',
      ]
  }
}

/**
 * The turns a brain sends, complaint included. Trimmed once, at the END: the history arrives
 * already bounded, so trimming before adding the complaint could only drop the complaint's room.
 */
export function turnsWith(history: readonly string[], complaint?: string): string[] {
  return recentHistory(complaint ? [...history, complaint] : history)
}

type Read = { reply: Reply | null; cost: number }

/**
 * 🛑 What ONE sentence may cost, in round trips, whatever path it takes.
 *
 * Three bounded layers compose to eight — retry ×2, narrow ×2, expand ×2 — and each was sure of
 * itself alone. On Scenario's door every one of them is a billed job, so the ceiling is held here
 * rather than deduced from the three.
 */
const TURN_ATTEMPTS = 4

/** The attempts one turn has left. Passed rather than closed over: a turn is not a session. */
type Budget = { left: number }

/**
 * One reply out of at most two attempts against ONE briefing.
 *
 * One retry only, and the second attempt is CAUGHT: the first pass was billed — measured at 0.75
 * units for the cheapest cloud — and an escaping rejection loses that figure.
 */
async function readOnce(
  briefing: Briefing,
  round: BrainRound,
  budget: Budget,
  restart: () => void,
  notes?: TurnNotes,
): Promise<Read> {
  budget.left -= 1
  restart()
  notes?.note({ kind: 'sent', door: notes.door, model: notes.model, text: briefing.text })
  const first = await round(briefing)
  notes?.note({ kind: 'answered', text: first.answer })
  const read = readReply(first.answer, REGISTERED_ACTIONS)
  if ('reply' in read) return { reply: read.reply, cost: first.cost }
  if (budget.left <= 0) return { reply: null, cost: first.cost }

  log.warn('assistant', `unreadable answer (${read.fault.kind}), asking once more`)
  budget.left -= 1
  restart()
  const complaint = complaintAbout(first.answer, read.fault)
  // The briefing goes out AGAIN beside it, so the note carries both — a reader chasing an
  // oversized request would otherwise read the retry as the cheap round.
  notes?.note({
    kind: 'sent',
    door: notes.door,
    model: notes.model,
    text: `${briefing.text}\n\n${complaint}`,
  })
  let second
  try {
    second = await round(briefing, complaint)
    notes?.note({ kind: 'answered', text: second.answer })
  } catch (error) {
    // 🛑 A stop is not a failed attempt to swallow: swallowed, the turn answers an empty sentence
    // and the window reads it as lost — the one thing the stop path exists to avoid.
    if (stopped(error)) throw error

    log.warn('assistant', `the second attempt failed: ${String(error)}`)
    second = { answer: '', cost: 0 }
  }

  return { reply: parseReply(second.answer, REGISTERED_ACTIONS), cost: first.cost + second.cost }
}

/**
 * One reading, and the shorter rules when the door refused the briefing it was given.
 *
 * The room a chat cloud holds is an assumption — the model is typed by hand — so this is what
 * degrades when the assumption is wrong: a refusal costs one round trip, not the turn.
 */
async function readOrNarrow(
  briefing: Briefing,
  round: BrainRound,
  budget: Budget,
  restart: () => void,
  notes?: TurnNotes,
): Promise<[Briefing, Read]> {
  try {
    return [briefing, await readOnce(briefing, round, budget, restart, notes)]
  } catch (error) {
    // Only a refusal of SIZE narrows. A missing key, a quota, a dropped network and a stopped
    // turn all reach here too, and none of them is answered by a shorter briefing.
    if (briefing.narrow === null || budget.left <= 0 || !(error instanceof OversizedRequest)) {
      throw error
    }

    log.warn('assistant', `too much for this door, asking with fewer rules: ${String(error)}`)
    const narrow = briefing.narrow()
    return [narrow, await readOnce(narrow, round, budget, restart, notes)]
  }
}

/**
 * A query for manuals rather than a plan, and only when it is the WHOLE answer: a plan that also
 * acts is one a blind model wrote, so its manuals are opened and it is written again instead.
 */
function discoveryIn(reply: Reply | null): string | null {
  const only = reply?.calls.length === 1 ? reply.calls[0] : undefined
  if (only?.action !== DISCOVERY_ACTION) return null

  const query = only.input['query']
  return typeof query === 'string' && query.trim() !== '' ? query : null
}

/**
 * 🛑 The actions a reply named without having their FIELDS — the catalogue is names alone, so this
 * is the ordinary way a model reaches something new rather than a fault.
 *
 * Refusing the reply over one was measured at 25 refusals and as many turns lost, and the retry
 * beside it complained about unreadable JSON — which was never what was wrong.
 */
const unloadedIn = (reply: Reply | null, loaded: readonly ActionName[]): readonly ActionName[] => [
  ...new Set(
    (reply?.calls ?? [])
      .map(call => call.action)
      // Nothing to open for a call with no fields — and asked again with `scene.state` opened,
      // the model dropped the transform it had planned beside it (7.5, 2026-09-06).
      .filter(name => !loaded.includes(name) && (assistantAction(name)?.fields.length ?? 0) > 0),
  ),
]

// Said plainly rather than thrown: the caller has a person waiting, and "I did not understand"
// is a better answer than a stack trace — and the cost was still incurred.
const answerOf = (read: Read, spentBefore: number, shown: Briefing): AssistantAnswer => {
  const cost = read.cost + spentBefore
  const opened = shown.opened.length > 0 ? { loaded: shown.opened } : {}
  return read.reply
    ? { ...read.reply, ...opened, cost }
    : { say: '', calls: [], unreadable: true, ...opened, cost }
}

/**
 * One answer for one sentence, whoever is doing the thinking, inside `TURN_ATTEMPTS` round trips.
 *
 * A round that names what it has no fields for is not an answer: its manuals are opened and the
 * model is asked again with them. `actions.find` is the same move by a WORD rather than a name.
 */
export async function answeredTurn(
  briefing: Briefing,
  round: BrainRound,
  onProgress?: (progress: AssistantProgress) => void,
  notes?: TurnNotes,
  discover?: (query: string) => Promise<readonly ActionName[]>,
): Promise<AssistantAnswer> {
  const budget: Budget = { left: TURN_ATTEMPTS }
  // 🛑 Here and in no brain: this is what KNOWS an attempt is starting, and an answer thrown away
  // appended to the one that replaces it reads as one answer contradicting itself.
  const restart = () => onProgress?.({ delta: '', restart: true })
  let shown = briefing
  let spent = 0

  for (;;) {
    // Through the same fallback every time: a briefing that has grown by a manual is longer than
    // the one that just went through, so it is the read most likely to be refused for its size.
    const [used, read] = await readOrNarrow(shown, round, budget, restart, notes)
    shown = used
    const before = spent
    spent += read.cost

    const missing = unloadedIn(read.reply, shown.loaded)
    if (budget.left <= 0) {
      // Sent on guessed fields rather than dropped: the calls are registered, and a turn that
      // answers nothing after four round trips reads as a model that had nothing to say.
      if (missing.length > 0) {
        log.warn('assistant', `out of attempts, calling ${missing.join(', ')} unopened`)
      }
      return answerOf(read, before, shown)
    }

    const query = discoveryIn(read.reply)
    if (query !== null && shown.expand !== null) {
      log.info('assistant', `the model asked what else there is: "${query}"`)
      shown = discover ? shown.withLoaded(await discover(query)) : shown.expand(query)
      continue
    }

    if (missing.length === 0) return answerOf(read, before, shown)

    log.info('assistant', `opening the manual of ${missing.join(', ')}`)
    shown = shown.withLoaded(missing)
  }
}
