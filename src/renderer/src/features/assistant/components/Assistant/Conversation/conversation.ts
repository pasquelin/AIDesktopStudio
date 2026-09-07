import {
  assistantAction,
  type AskedAnswer,
  HISTORY_BLOCK_MAX,
  type ActionName,
  type ActionRefusal,
  refusalKey,
} from '@shared/domain/assistant'
import { isRecord } from '@shared/guards'
import { stableKey } from '@shared/hash'
import { byCodeUnit } from '@shared/text'
import { englishText } from '@shared/i18n'

/**
 * What one action of a turn did. `refusal` is `null` when it ran.
 *
 * `data` is what it ANSWERED, and it is what makes a chain possible: the model asks for a path
 * it does not know, and the next step of its own plan is written from this. Absent for an action
 * that answers nothing, which most of the acting ones do.
 */
export type AssistantStep = {
  action: ActionName
  refusal: ActionRefusal | null
  /** What was wrong, from `inputProblem` — English, for the model, never for the screen. */
  detail?: string
  /** Set for a RELATIVE call alone — see `repeatedRelative`, which is what it exists for. */
  repeatKey?: string
  /** Set for a call whose action is not `repeatable` — see `alreadySettled`. */
  settledKey?: string
  data?: unknown
}

/**
 * 🛑 What one result may spend of the model's window, in characters.
 *
 * A listing of a full project is thousands of entries; handed back whole it would push the
 * briefing out of every door. Cut to a size, and what was cut is SAID: a model reading a silently
 * truncated list plans against a project half of which it cannot see.
 *
 * 🛑 `[M]` Raised twice and put back twice. 3 000 on 2026-08-31, over 120 runs of sections 6, 7,
 * 22 and 61: 79 passed at 600, 79 at 3 000. Then 1 600 on 2026-09-01, once `scene.state` had been
 * halved and the argument looked new — 63 runs of sections 6 and 7 answered 50 passed at 600
 * against 47 at 1 600. It is the ANSWER that has to be made smaller, never this: `sceneHandlers.ts`
 * and `sequenceHandlers.ts` leave out what stands at its default, and that is what a model gets
 * more of. Reordering does not help either, and `sceneHandlers.ts` says why.
 */
export const RESULT_MAX = 600

/** The first entries of a list, or a value, as the model reads it — never a broken JSON tail. */
export function resultLine(data: unknown): string {
  if (Array.isArray(data)) return listWithin(data)

  const written = JSON.stringify(data) ?? ''
  if (written.length <= RESULT_MAX) return written
  if (isRecord(data)) return recordWithin(data)

  // A lone value is cut by characters and SAID to be cut: it has no members to drop by, and a
  // model told nothing would read the tail it never got as the whole answer.
  return `${written.slice(0, RESULT_MAX)}… (cut short)`
}

/**
 * 🛑 Whole MEMBERS, never characters: `scene.state` runs past the ceiling, so the tail was cut
 * mid-value and the model copied `8edfaabe-0ebd…` as a row id — three calls refused on an id that
 * was never whole, measured 2026-08-31.
 *
 * `continue`, not `break` as `listWithin` does: a small member must survive a big one before it,
 * or one long list takes every id after it down. What was dropped is NAMED, since a model told
 * only that something was cut cannot know whether what it needs is behind the ellipsis.
 */
function recordWithin(data: Record<string, unknown>): string {
  const kept: string[] = []
  const dropped: string[] = []
  let left = RESULT_MAX

  for (const [key, value] of Object.entries(data)) {
    // `undefined` is a member that is NOT THERE: `JSON.stringify` omits it, and writing `null`
    // instead tells the model a value was answered where none was.
    if (value === undefined) continue

    const written = `${JSON.stringify(key)}:${JSON.stringify(value) ?? 'null'}`
    if (written.length + 1 <= left) {
      left -= written.length + 1
      kept.push(written)
      continue
    }

    /**
     * 🛑 A LIST too long gives what fits rather than nothing: `scene.state` answers `nodes`, the
     * only place a node id is ever published, and dropping it whole left the assistant unable to
     * name a single object of the scene it was looking at.
     */
    const items: readonly unknown[] = Array.isArray(value) ? value : []
    const trimmed = items.length === 0 ? null : someOf(items, left - key.length - 4)
    if (trimmed === null) {
      dropped.push(key)
      continue
    }
    left -= trimmed.written.length + key.length + 4
    kept.push(`${JSON.stringify(key)}:${trimmed.written}`)
    dropped.push(`${key} (first ${trimmed.count} of ${items.length})`)
  }

  const more = dropped.length === 0 ? '' : ` (cut short: ${dropped.join(', ')})`
  return `{${kept.join(',')}}${more}`
}

/** As many WHOLE items of a list as `room` takes, or nothing when not even one does. */
function someOf(
  items: readonly unknown[],
  room: number,
): { written: string; count: number } | null {
  const kept: string[] = []
  let left = room

  for (const item of items) {
    const written = JSON.stringify(item) ?? 'null'
    if (written.length + 1 > left) break
    left -= written.length + 1
    kept.push(written)
  }

  return kept.length === 0 ? null : { written: `[${kept.join(',')}]`, count: kept.length }
}

/**
 * Entries dropped by WHOLE items and counted, never by characters: half an entry is a path the
 * model would call with, and a call on half a path opens nothing.
 */
function listWithin(items: readonly unknown[]): string {
  // 🛑 An empty list is where a chain stalls, and `0 results: []` reads as an answer rather than
  // as nothing at all: the model reported it to the person and stopped. Said in words rather
  // than in brackets, at the moment it decides.
  //
  // No instruction with it, and that is deliberate: `jobs.list` answers empty for a job that has
  // not registered yet, and "do not repeat it" would tell a model to stop watching its own
  // generation — the very thing it was asked to do.
  if (items.length === 0) return '0 results — nothing matched.'

  const kept: string[] = []
  let left = RESULT_MAX

  for (const item of items) {
    const written = JSON.stringify(item) ?? ''
    if (written.length + 2 > left) break
    left -= written.length + 2
    kept.push(written)
  }

  const rest = items.length - kept.length
  const more = rest > 0 ? ` (and ${rest} more, not shown)` : ''
  return `${items.length} results: [${kept.join(', ')}]${more}`
}

/**
 * One question the assistant put to the person, and what came back — `null` where they dismissed
 * it, which is what ends the chain.
 */
export type AssistantAsked = AskedAnswer & {
  question: string
  /** The card was LET GO rather than this question left blank — see `cameBack`. */
  dismissed?: true
}

/**
 * One exchange: what was said, what came back, and what it actually did.
 *
 * The steps are kept apart from the sentence rather than folded into it, because the two are
 * read by different eyes: the conversation draws a line per step in the person's own language,
 * and the
 * model gets the same steps in English through `assistantHistory`.
 */
export type AssistantTurn = {
  id: number
  said: string
  /** What the assistant answered. Empty when the actions speak for themselves. */
  answered: string
  steps: readonly AssistantStep[]
  /**
   * 🛑 Read back AFTER the steps, whatever round each happened in: a question asked at round two
   * and calls run at round three read in the wrong order. What the model needs — that it asked,
   * and what it got — survives; exact order would cost one list of two shapes.
   */
  asks: readonly AssistantAsked[]
  /** Nothing readable came back — the model gave up after its retry, or the studio never answered. */
  lost: boolean
  /**
   * How a chain ended when it did not end by itself. Absent means the model answered with no
   * calls left — the only ending that means "done".
   *
   * Written rather than inferred: a chain cut at its ceiling looks exactly like one that
   * finished, and a person told nothing would take a half-done job for a finished one.
   */
  ending?: 'halted' | 'stopped'
  /**
   * The opening answer neither called nor asked, and was sent back once — see `chainOn`. Read
   * by the next round as the reason it is being asked again.
   */
  nudged?: boolean
}

/**
 * 🛑 What a sent-back opening answer is told. A first answer with no call and no question was,
 * measured 2026-09-02, mostly a recital of the state block: « il y a déjà une lumière
 * directionnelle », three runs out of three, `scene.state` never called.
 */
export const NUDGE =
  'You neither called nor asked: what the studio holds is READ, never recalled. Call the read ' +
  'that answers, or "ask". If there is truly nothing to call, answer again.'

/**
 * The conversation as the model reads it: one block per turn, oldest first.
 *
 * One block per TURN and not one per line, because the API counts blocks and stops at ten
 * (`HISTORY_MAX`) — a block per line would spend the whole budget on two exchanges. The trimming
 * itself belongs to the main process, which is where the limit is enforced.
 *
 * English throughout, including the refusals: it is what the model reasons in, and a studio
 * running in French must not decide differently from one running in English.
 */
export function assistantHistory(turns: readonly AssistantTurn[]): string[] {
  return turns.map(one => blockWithin(blockOf(one)))
}

/**
 * 🛑 One block cut to what the boundary takes, from the OLDEST steps in.
 *
 * A chain writes into one block, and a long one is refused whole — `parseThought` throws, the
 * window reads nothing back, and a chain that was working dies as "I did not manage to answer
 * that one". What a round needs is what just happened, so the head and the tail are what stay.
 */
function blockWithin(block: string): string {
  if (block.length <= HISTORY_BLOCK_MAX) return block

  const [head = '', ...rest] = block.split('\n')
  // The sentence is cut too: a 10 000-character paste is a whole block on its own, and a head
  // emitted whatever its length would overrun the bound with no step shown at all.
  const said =
    head.length > HISTORY_BLOCK_MAX / 2 ? `${head.slice(0, HISTORY_BLOCK_MAX / 2)}…` : head
  const kept: string[] = []
  let left = HISTORY_BLOCK_MAX - said.length - 40

  for (const line of [...rest].reverse()) {
    if (line.length + 1 > left) break
    left -= line.length + 1
    kept.unshift(line)
  }

  // Said, never silent: a model reading a block it cannot tell was cut plans against steps it
  // believes never ran, and runs them again.
  return [said, `(${rest.length - kept.length} earlier steps not shown)`, ...kept].join('\n')
}

/**
 * 🛑 Left BLANK and let GO read differently: one chain carries on, the other stops, and told the
 * same sentence a model has no reason to do either.
 */
function cameBack(asked: AssistantAsked): string {
  if (asked.dismissed) return 'the person dismissed the question.'

  // 🛑 On BOTH branches: a question that offered a note and got nothing else is one answered by
  // its note alone, and dropping it there drops what the question existed to collect.
  const note = asked.note === undefined ? '' : ` (${asked.note})`

  return asked.answer === null
    ? `the person left it blank${note}.`
    : `the person answered: ${asked.answer}${note}`
}

function blockOf(turn: AssistantTurn): string {
  const lines = [`The person said: ${turn.said}`]
  if (turn.answered !== '') lines.push(`You answered: ${turn.answered}`)

  for (const step of turn.steps) lines.push(stepLine(step))

  // 🛑 ONE line for the pair: `blockWithin` keeps a contiguous TAIL, so split in two a long
  // question was cut while its answer stayed, and the round read an answer to nothing.
  for (const asked of turn.asks) lines.push(`You asked: ${asked.question} — ${cameBack(asked)}`)

  if (turn.nudged) lines.push(NUDGE)

  // Said rather than left out: a turn that shows as nothing at all would have the model repeat
  // the sentence it already failed on, instead of trying it another way.
  if (turn.lost) lines.push('You did not manage to answer that one.')
  if (turn.ending === 'halted') lines.push('You were stopped there: too many rounds on that one.')
  if (turn.ending === 'stopped') lines.push('The person stopped you there.')

  return lines.join('\n')
}

function stepLine(step: AssistantTurn['steps'][number]): string {
  if (step.refusal !== null) {
    const why = englishText(refusalKey(step.refusal))
    return `You tried ${step.action}, refused: ${why}${step.detail === undefined ? '' : ` — ${step.detail}`}`
  }

  return step.data === undefined
    ? `You ran ${step.action}.`
    : `You ran ${step.action}. It answered: ${resultLine(step.data)}`
}

/**
 * 🛑 What a relative call is keyed by, so the same one cannot be applied twice in one turn.
 *
 * An absolute call repeated writes the same value; a RELATIVE one adds again. Measured on the
 * bench pass of 2026-08-26: « 20 degrés de plus » was sent twice and turned the cube by 40.
 *
 * 🛑 The NUMBERS are left out of the key, and that is the whole of it: a model that second-guesses
 * its own arithmetic sends the same change again under another figure, and the two land one on
 * top of the other. Measured 2026-09-02 — « 50 cm à droite » went out as `positionX: 0.5` then as
 * `positionX: 2.5`, leaving the sphere three metres out, and « 20 degrés de plus » was sent twice
 * as 0.3490658503988659 then 0.34906585, which the whole-input key read as two different calls.
 */
export function repeatKeyOf(action: ActionName, input: Record<string, unknown>): string | null {
  if (input.relative !== true) return null

  const named = Object.fromEntries(Object.entries(input).filter(([, one]) => !isNumber(one)))
  const moved = Object.keys(input).filter(one => isNumber(input[one]))
  return `${action} ${stableKey(named)} ${[...moved].sort(byCodeUnit).join(',')}`
}

const isNumber = (value: unknown): boolean => typeof value === 'number'

/**
 * Whether this TURN already ran that very relative call, and got it done.
 *
 * 🛑 Its blind spot, and a deliberate one: an MCP client reaching `runConfirmedAction` has no
 * turn, so nothing stops it repeating. That is right — a model writes a turn's calls in one
 * breath, where two MCP calls are two intentions. The bench measures `say()`, so it measures a
 * path better guarded than the MCP door it certifies.
 */
export function repeatedRelative(steps: readonly AssistantStep[], key: string | null): boolean {
  return key !== null && steps.some(one => one.repeatKey === key && one.refusal === null)
}

/**
 * What a call that sets a NAMED state is keyed by, so one turn cannot set it twice. Apart from
 * `repeatKeyOf`: a relative call repeated ADDS, where this one asks again for what already
 * stands. `stableKey` so a call re-serialised in another key order keys to the same string.
 */
export function settledKeyOf(action: ActionName, input: Record<string, unknown>): string | null {
  return assistantAction(action)?.repeatable === false ? `${action} ${stableKey(input)}` : null
}

/**
 * Whether that state is the one this action LAST set in the turn — never merely one it once set:
 * arming A, then B, then A again is a plan, and only asking twice for the state that already
 * stands is the loop.
 */
export function alreadySettled(
  steps: readonly AssistantStep[],
  action: ActionName,
  key: string | null,
): boolean {
  const last = steps.filter(one => one.action === action && one.refusal === null).at(-1)

  return key !== null && last?.settledKey === key
}
