import {
  assistantAction,
  commitmentOfCall,
  needsConfirmation,
  inputProblem,
  readInput,
  refused,
  type ActionCommitment,
  type ActionName,
  type ActionOutcome,
} from '@shared/domain/assistant'
import { delegated } from '@shared/domain/delegation'
import { messageOf } from '@shared/guards'
import { englishText, fillHoles } from '@shared/i18n'
import { getBridge } from '@/services/bridge'
import { useSettings } from '@/stores/settings'
import type { ActionHandler, ActionHandlers } from './actionHandler'
import { mountedConfirmer } from './confirm'
import { confirmSentence, type Translate } from './confirmSentence'
import {
  holdsConsent,
  mintConsent,
  splitConsent,
  takeConsent,
  type QuotedBody,
  type WireCall,
} from './wireConsent'
import { ASSEMBLY_HANDLERS } from './assemblyHandlers'
import { EXPORT_HANDLERS } from './exportHandlers'
import { ASSET_HANDLERS } from './assetHandlers'
import { CANVAS_HANDLERS } from './canvasHandlers'
import { CLOUD_HANDLERS } from './cloudHandlers'
import { CORE_HANDLERS } from './coreHandlers'
import { FILE_HANDLERS } from './fileHandlers'
import { mountedGenerator } from './generatorBridge'
import { GIT_HANDLERS } from './gitHandlers'
import { JOB_HANDLERS } from './jobHandlers'
import { MATERIAL_HANDLERS } from './materialHandlers'
import { RIG_HANDLERS } from './rigHandlers'
import { POST_HANDLERS } from './postHandlers'
import { SCENE_HANDLERS } from './sceneHandlers'
import { SEQUENCE_HANDLERS } from './sequenceHandlers'
import { CONTEXT_HANDLERS } from './contextHandlers'
import { MEMORY_HANDLERS } from './memoryHandlers'
import { GAME_HANDLERS } from './gameHandlers'
import { PLAY_HANDLERS } from './playHandlers'
import { SCRIPT_HANDLERS } from './scriptHandlers'
import { STUDIO_HANDLERS } from './studioHandlers'
import { TIMELINE_HANDLERS } from './timelineHandlers'
import { readBatch, type BatchedCall } from './batch'
import { rememberOutcome } from './rememberOutcome'
import { SETTINGS_HANDLERS } from './settingsHandlers'
import { SHELL_HANDLERS } from './shellHandlers'
import { STATE_HANDLERS } from './stateHandlers'
import { TARGET_HANDLERS } from './targetHandlers'
import { PROJECT_HANDLERS } from './projectHandlers'
const HANDLERS: ActionHandlers = {
  ...CORE_HANDLERS,
  ...GAME_HANDLERS,
  ...PLAY_HANDLERS,
  ...SCRIPT_HANDLERS,
  ...STUDIO_HANDLERS,
  ...TIMELINE_HANDLERS,
  ...ASSEMBLY_HANDLERS,
  ...EXPORT_HANDLERS,
  ...TARGET_HANDLERS,
  ...PROJECT_HANDLERS,
  ...STATE_HANDLERS,
  ...FILE_HANDLERS,
  ...JOB_HANDLERS,
  ...ASSET_HANDLERS,
  ...CLOUD_HANDLERS,
  ...CANVAS_HANDLERS,
  ...SEQUENCE_HANDLERS,
  ...MATERIAL_HANDLERS,
  ...SCENE_HANDLERS,
  ...POST_HANDLERS,
  ...RIG_HANDLERS,
  ...GIT_HANDLERS,
  ...CONTEXT_HANDLERS,
  ...MEMORY_HANDLERS,
  ...SETTINGS_HANDLERS,
  ...SHELL_HANDLERS,
  'studio.batch': runBatch,
}
export function handledActions(): readonly string[] {
  return Object.keys(HANDLERS)
}

let spentUnasked = 0

export function resetDelegatedSpendForTests(): void {
  spentUnasked = 0
}

/** The input as its fields declare it, or the refusal that names the field to repair. */
function readOrRefusal(
  name: ActionName,
  input: Record<string, unknown>,
): { listed: Record<string, unknown> } | { refusal: ActionOutcome } {
  const action = assistantAction(name)
  if (!action)
    return {
      refusal: refused(
        'badInput',
        `no action named "${name}" in this studio — actions.find answers what it publishes`,
      ),
    }

  const listed = readInput(action.fields, input)
  return listed
    ? { listed }
    : { refusal: refused('badInput', inputProblem(action.fields, input) ?? undefined) }
}

export async function runAction(
  name: ActionName,
  input: Record<string, unknown>,
  wire?: WireCall,
  signal?: AbortSignal,
): Promise<ActionOutcome> {
  const handler = HANDLERS[name]
  if (!handler)
    return refused(
      'badInput',
      `the action "${name}" is published, and nothing behind it answers — actions.find lists the ones that do`,
    )

  const read = readOrRefusal(name, input)
  if ('refusal' in read) return read.refusal

  const outcome = await ranSafely(handler, read.listed, wire, signal)
  // Not awaited, and the input READ rather than the one sent: what a memory anchors on must be
  // what the action actually acted on. A memory that will not persist must not turn a call that
  // changed the studio into a refusal.
  void rememberOutcome(name, read.listed, outcome)
  return outcome
}

async function ranSafely(
  handler: ActionHandler,
  listed: Record<string, unknown>,
  wire: WireCall | undefined,
  signal: AbortSignal | undefined,
): Promise<ActionOutcome> {
  try {
    return await handler(listed, wire, signal)
  } catch (error) {
    // `failed` and not `badInput`: the input was checked at the door, so what threw is the studio
    // — a client told its input was wrong would retry a call that was never the problem.
    return refused('failed', messageOf(error))
  }
}

async function runBatch(input: Record<string, unknown>, wire?: WireCall): Promise<ActionOutcome> {
  const read = readBatch(input)
  if ('refusal' in read) return read.refusal

  const lot = wire ? await lotCleared(read.calls) : null
  if (lot && 'refusal' in lot) return lot.refusal

  const done: unknown[] = []
  for (const [at, call] of read.calls.entries()) {
    const planned = lot?.plan[at]
    const outcome = planned
      ? await runPlanned(planned, wire)
      : await runConfirmedAction(call.action, call.input)
    if (!outcome.ok) return ranked(at, outcome)
    done.push(outcome.data ?? null)
  }
  return { ok: true, data: { ran: done.length, results: done } }
}

async function runPlanned(planned: Planned, wire: WireCall | undefined): Promise<ActionOutcome> {
  if (planned.token) takeConsent(planned.token, planned.name, planned.listed)

  return runCleared(planned.name, planned.listed, planned.cleared, wire)
}

/** The RANK a client repairs from — one-based, as a person counts a list. */
const ranked = (at: number, outcome: ActionOutcome): ActionOutcome =>
  outcome.ok
    ? outcome
    : { ...outcome, detail: `call ${at + 1}: ${outcome.detail ?? outcome.refusal}` }

/** One call of a wire lot, read and cleared before any of them runs. */
type Planned = {
  name: ActionName
  listed: Record<string, unknown>
  cleared: Cleared
  /** The token that answered for it, spent when this call runs and not before. */
  token?: string
}

/**
 * 🛑 A lot from the wire clears EVERY call before it runs any, and refuses whole.
 *
 * Stopping at the first call wanting a token had the ones before it ACT, and the client sending
 * the lot back with that token replayed them. The refusal names one token per call missing one.
 */
async function lotCleared(
  calls: readonly BatchedCall[],
): Promise<{ plan: readonly Planned[] } | { refusal: ActionOutcome }> {
  const plan: Planned[] = []
  // 🛑 A token answers for ONE call. `holdsConsent` does not spend, so the same one offered on
  // five identical calls of a lot cleared all five on a single yes — measured 2026-08-30.
  const claimed = new Set<string>()
  const asked: string[] = []
  // The ledger as the lot would leave it, so a budget spent by call two is not offered to call
  // three — which is what running the calls one after another does.
  let spent = spentUnasked
  const price = pricedOnce()

  for (const [at, call] of calls.entries()) {
    const result = await planCall(call, at, spent, claimed, price)
    if ('refusal' in result) return { refusal: result.refusal }
    if ('asked' in result) asked.push(result.asked)
    else {
      plan.push(result.planned)
      spent += result.planned.cleared.debit
    }
  }

  if (asked.length > 0) return { refusal: refused('needsConsent', asked.join('\n')) }

  return { plan }
}

type PlanCallResult = { planned: Planned } | { asked: string } | { refusal: ActionOutcome }

async function planCall(
  call: BatchedCall,
  at: number,
  spent: number,
  claimed: Set<string>,
  price: () => Promise<number | null>,
): Promise<PlanCallResult> {
  const { given, wire } = splitConsent(call.input)
  const read = readOrRefusal(call.action, given)
  if ('refusal' in read) return { refusal: ranked(at, read.refusal) }

  const engaged = await engagementOf(call.action, read.listed, spent, price)
  const token = wire.consent !== undefined && !claimed.has(wire.consent) ? wire.consent : undefined
  if (!engaged || engaged.armed) {
    if (engaged && token !== undefined) takeConsent(token, call.action, read.listed)
    const cleared = clearedWithoutAsking(engaged)
    return { planned: { name: call.action, listed: read.listed, cleared } }
  }

  const held = token === undefined ? null : holdsConsent(token, call.action, read.listed)
  if (token === undefined || !held)
    return {
      asked: `call ${at + 1}: ${consentAsked(call.action, read.listed, engaged, ASK_IN_LOT)}`,
    }
  return plannedWithConsent(call.action, read.listed, engaged, held.quoted, token, claimed)
}

function plannedWithConsent(
  name: ActionName,
  listed: Record<string, unknown>,
  engaged: Engagement,
  quoted: QuotedBody | null,
  token: string,
  claimed: Set<string>,
): PlanCallResult {
  claimed.add(token)
  const cleared = { quoted, debit: engaged.estimate ?? 0 }
  return { planned: { name, listed, cleared, token } }
}

export async function runConfirmedAction(
  name: ActionName,
  input: Record<string, unknown>,
  wire?: WireCall,
): Promise<ActionOutcome> {
  // Checked before the question as well as inside `runAction`: a bad input asked about first
  // would have the person approve a spend that was never going to happen.
  const read = readOrRefusal(name, input)
  if ('refusal' in read) return read.refusal

  const cleared = await clearance(name, read.listed, wire, spentUnasked, estimateOfSubmission)
  if ('refusal' in cleared) return cleared.refusal

  return runCleared(name, read.listed, cleared.cleared, wire)
}

/** What a call cleared with: the form its spend was priced against, and what the delegated
 * ledger owes for it. */
type Cleared = {
  quoted: QuotedBody | null
  debit: number
  /** The input as the CARD left it — a folder the person pointed at where the model guessed a
   * name. Absent on every door but the screen. */
  amended?: Record<string, unknown>
}

type Clearance = { cleared: Cleared } | { refusal: ActionOutcome }

/** What a call engages, priced once, and whether the studio was armed to let it through. */
type Engagement = { commitment: ActionCommitment; estimate: number | null; armed: boolean }

async function engagementOf(
  name: ActionName,
  listed: Record<string, unknown>,
  spent: number,
  price: () => Promise<number | null>,
): Promise<Engagement | null> {
  const commitment = commitmentOfCall(name, listed)
  if (!needsConfirmation(commitment)) return null

  // Read once, before the question and before the delegation is consulted: both read the same
  // figure, and a form moved between the two would price one thing and send another.
  const estimate = commitment === 'credits' ? await price() : null

  return {
    commitment,
    estimate,
    armed: delegated(useSettings.getState().settings.mcp, commitment, estimate, spent),
  }
}

/** Nothing engaged, or the studio armed for it — and then the ledger owes what was quoted. */
const clearedWithoutAsking = (engaged: Engagement | null): Cleared => ({
  quoted: null,
  debit: engaged?.estimate ?? 0,
})

/** The yes a call needs before it runs, from whichever door it came through. */
async function clearance(
  name: ActionName,
  listed: Record<string, unknown>,
  wire: WireCall | undefined,
  spent: number,
  price: () => Promise<number | null>,
): Promise<Clearance> {
  const engaged = await engagementOf(name, listed, spent, price)
  if (!engaged) return { cleared: clearedWithoutAsking(null) }

  // 🛑 A token offered for a call the delegation already covers is spent all the same: left
  // standing it answers a second time, for a spend the ceiling no longer covers.
  if (engaged.armed) {
    if (wire?.consent !== undefined) takeConsent(wire.consent, name, listed)
    return { cleared: clearedWithoutAsking(engaged) }
  }

  // A caller with no screen here is asked across the boundary instead of on the glass: same gate,
  // same figure, and nothing runs before a yes comes back either way.
  if (!wire) return consentedOnScreen(name, listed, engaged)

  // A token is one round trip — never a standing permission, which is what `delegated()` is for.
  const held = wire.consent === undefined ? null : takeConsent(wire.consent, name, listed)

  // 🛑 Debited like a delegated call: a token spends with nobody at the screen either, and a
  // ceiling counted on one door alone bounds nothing the moment a second opens beside it.
  return held
    ? { cleared: { quoted: held.quoted, debit: engaged.estimate ?? 0 } }
    : { refusal: refused('needsConsent', consentAsked(name, listed, engaged, ASK_ALONE)) }
}

async function consentedOnScreen(
  name: ActionName,
  listed: Record<string, unknown>,
  engaged: Engagement,
): Promise<Clearance> {
  const ask = mountedConfirmer()
  // No one to ask. Refusing is the only honest answer: the alternative is spending on a question
  // nobody was shown.
  if (!ask)
    return {
      refusal: refused(
        'noConfirmer',
        'this call engages something, and no window is up to put the question to anybody — nothing engaging ever runs unasked',
      ),
    }

  // Read BEFORE the question and compared after it — see `unchangedSince`.
  const quoted = quotedNow(engaged.commitment)

  const given = await ask({
    action: name,
    input: listed,
    commitment: engaged.commitment,
    ...(engaged.commitment === 'credits' ? { estimate: engaged.estimate } : {}),
  })
  if (!given.granted)
    return { refusal: refused('declined', 'the person at the screen said no to this call') }

  // 🛑 What the card SHOWED is what runs: `raises` reads the input, so a value amended on the
  // card could lift the level above the sentence the person read before saying yes.
  if (commitmentOfCall(name, given.input) !== engaged.commitment) {
    return {
      refusal: refused(
        'formChanged',
        'the card was amended into a call that engages more than the sentence the person read — send the call again as it stood',
      ),
    }
  }

  // Nothing debited: somebody SAW this one, and the ledger counts what went out unwatched.
  return { cleared: { quoted, debit: 0, amended: given.input } }
}

/**
 * What was priced is what goes out, or nothing does.
 *
 * The question may stand for two minutes — that is what an MCP client is given — and the
 * generator panel stays live behind it. Raising `numImages` from one to ten while "~4 CU" is on
 * screen used to send the ten: the figure was read before the question and the form re-read
 * after the yes, with nothing tying the two together. The yes belongs to a body, not to a moment.
 */
async function runCleared(
  name: ActionName,
  listed: Record<string, unknown>,
  cleared: Cleared,
  wire: WireCall | undefined,
): Promise<ActionOutcome> {
  if (cleared.quoted && !unchangedSince(cleared.quoted))
    return refused(
      'formChanged',
      'the generation form moved between the figure being quoted and the yes, and what was priced is what goes out — generator.readArmedGeneration says what stands now, then send this again',
    )

  // Debited BEFORE the run and never given back: an action that failed halfway may already have
  // spent, and a ledger that only counted successes would let a run of failures spend forever.
  spentUnasked += cleared.debit

  // 🛑 What the CARD left, which `runAction` checks like any other input — a folder the person
  // pointed at was never seen by the check at the door.
  return runAction(name, cleared.amended ?? listed, wire)
}

/** What the generation panel holds, read before a spend is priced against it. */
const quotedNow = (commitment: ActionCommitment): QuotedBody | null =>
  commitment === 'credits' ? (mountedGenerator()?.body() ?? null) : null

/** `detail` is read by a machine and never shown, so the English bundle rather than a locale. */
const inEnglish: Translate = (key, holes) =>
  holes ? fillHoles(englishText(key), holes, 'en') : englishText(key)

/**
 * 🛑 Where the token goes is not the same on the two doors, and `studio.batch` publishes no
 * `consent` of its own: a lot carries it inside the input of the call it answers for.
 */
const ASK_ALONE = 'assistant.consent.ask'
const ASK_IN_LOT = 'assistant.consent.askInLot'

/** The token, and the same sentence the modal shows — what a call engages does not depend on
 * which door asked. */
function consentAsked(
  name: ActionName,
  listed: Record<string, unknown>,
  engaged: Engagement,
  askKey: string,
): string {
  // Priced as the token is minted, so the yes that comes back answers for THIS form.
  const token = mintConsent(name, listed, quotedNow(engaged.commitment))
  const engages = confirmSentence(engaged.commitment, engaged.estimate, inEnglish, 'en')

  return `${engages}${inEnglish(askKey, { token })}`
}

/**
 * 🛑 One price for a whole lot: `estimateOfSubmission` reads the panel, not the call, and no call
 * of the lot has run yet. Asked per call, a full lot was fifty identical round trips to the API.
 */
function pricedOnce(): () => Promise<number | null> {
  let asked: Promise<number | null> | null = null

  return () => (asked ??= estimateOfSubmission())
}

function unchangedSince(quoted: { modelId: string; values: Record<string, unknown> }): boolean {
  const now = mountedGenerator()?.body()
  return (
    now !== undefined &&
    now !== null &&
    now.modelId === quoted.modelId &&
    JSON.stringify(now.values) === JSON.stringify(quoted.values)
  )
}

/**
 * What the prepared form would cost, for the question that is about to be asked.
 *
 * `null` is a legitimate answer and is shown as such: the API declines to price some models, and
 * a figure invented to fill the sentence would be worse than admitting there is none.
 */
async function estimateOfSubmission(): Promise<number | null> {
  const prepared = mountedGenerator()?.body()
  const bridge = getBridge()
  if (!prepared || !bridge) return null

  try {
    const estimate = await bridge.provider.estimateCost({ id: prepared.modelId }, prepared.values)
    return estimate?.creativeUnits ?? null
  } catch {
    return null
  }
}
