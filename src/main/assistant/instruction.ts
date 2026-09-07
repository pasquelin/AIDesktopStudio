import {
  ACTION_REGISTRY,
  findActions,
  MOST_LOADED,
  type AssistantThought,
  type ActionName,
} from '@shared/domain/assistant'
import { CONTEXT_COMPOSED_MAX } from '@shared/domain/projectContext'
import type { Target } from '@shared/domain/target'
import { linesWithin, STATE_MAX } from './studioState'
import {
  actionBlock,
  CONTINUING,
  FORMAT,
  manualPrinted,
  manualText,
  MEMORY_CALL,
  MISSION_RULES,
  namesPrinted,
  roleWith,
  RULES,
  targetLine,
  TOOL_FORMAT,
  type Manual,
  WIDE_RULES,
} from './instructionCatalogue'

export { recentHistory } from './instructionCatalogue'
export type BriefingParts = {
  /** A mission round: `context` is the mission JSON, and `MISSION_RULES` says how to read it. */
  mission?: boolean
  /** A round after the first on one sentence — see `CONTINUING`, which is what it adds. */
  continuing?: boolean
  /** The manuals travel as native tools too, so the FORMAT says to call them — `TOOL_FORMAT`. */
  tools?: boolean
  /** The spaces nothing can generate in, so the model says so before promising a picture. */
  notReady?: readonly string[]
  /** What the open project is about, already composed — see `composedContext`. */
  context?: string
  /** What the studio is right now, already in sentences — see `describeStudio`. */
  state?: string
  /**
   * How many memories this project holds. What the briefing pays instead of the memories.
   *
   * 🛑 A COUNT, never a recall — see `memorySignal`. Injecting summaries paid an embedding and a
   * vector scan on every single turn for a block that four doors of five threw away whole.
   */
  memories?: number
  /** Where this machine keeps a person's folders, absolute — see `AssistantThought.folders`. */
  folders?: string
  /** What the open document can be aimed at, narrowed by the window — see `target.ts`. */
  targets?: readonly Target[]
  /**
   * 🛑 What the CHAIN asked for, never the manuals the studio loads from the start: they are the
   * only names that must cross back over the boundary, and the only ones put at the BACK of
   * `loaded` to survive the cut, which bites from the front.
   */
  opened?: readonly ActionName[]

  /** Whose MANUAL this briefing carries — see `AssistantThought.loaded`. */
  loaded?: readonly ActionName[]
  /**
   * 🛑 How much briefing the brain about to carry it can hold — a number that belongs to the
   * BRAIN and not to this file. What the model is SHOWN of the manuals follows from it.
   *
   * Not a ceiling on the whole: the names, the rules and the FORMAT are what never give ground,
   * and a door too tight for them is told fewer rules (`studioBriefing`) rather than fewer names.
   */
  room: number
  /**
   * What the briefing is budgeted against when this door refused the first one — a fact of the
   * door, which has just disproved its own `room`. Defaults to `room`, which is right for a door
   * that was never shown the wide rules in the first place.
   */
  fallbackRoom?: number
}

/**
 * What the model is shown, and what an answer is then held to.
 *
 * Every name the registry declares is printed on every door — 4 225 characters — and `parseReply`
 * refuses the rest. `loaded` is narrower: what the model has the FIELDS of. `answeredTurn` never
 * executes an action outside it; it opens its manual and asks for the plan again first.
 */
export type Briefing = {
  readonly text: string
  /** The manuals this briefing CARRIES, oldest first — what has fields, for `unloadedIn`. */
  readonly loaded: readonly ActionName[]
  /** Of those, the ones the CHAIN asked for: what travels back, never the default load. */
  readonly opened: readonly ActionName[]
  /** The same briefing with these manuals opened as well. */
  readonly withLoaded: (names: readonly ActionName[]) => Briefing
  /** The same briefing with what a query found opened, or nothing once one has been answered. */
  readonly expand: ((query: string) => Briefing) | null
  /**
   * The same parts with the wide rules dropped, for a door that REFUSED this one — a door's room
   * is an assumption about a hand-typed model's window. `null` once they are already dropped.
   */
  readonly narrow: (() => Briefing) | null
}

type Written = { readonly text: string; readonly held: readonly ActionName[] }

function manualsWithin(manuals: readonly Manual[], over: number): readonly Manual[] {
  const held = [...manuals]
  let remaining = over
  while (remaining > 0 && held.length > 0) remaining -= (held.shift()?.text.length ?? 0) + 1
  return held
}

function finalBriefing(
  one: Composition,
  manuals: string,
  found: string,
  state: string,
  targets: readonly Target[],
  previous: string,
): string {
  const room = Math.max(0, (one.parts.context ?? '').length - (previous.length - one.parts.room))
  const trimmed = withParts(one, { context: linesWithin(one.parts.context ?? '', room) })
  const withContext = composed(trimmed, manuals, found, state, targets)
  if (withContext.length <= one.parts.room) return withContext
  return composed(withParts(trimmed, { folders: '' }), manuals, found, state, targets)
}

/**
 * 🛑 What GIVES GROUND when the room runs out, in order: the manuals, the state, the targets, the
 * project context, and the folders. Never the names, never the rules, and never the sentence,
 * which `instructionFor` guarantees.
 */
function briefingText(one: Composition, manual: readonly Manual[], found: string): Written {
  const parts = one.parts
  const state = parts.state ?? ''
  const targets = parts.targets ?? []
  const full = composed(one, manualText(manual), found, state, targets)
  if (full.length <= parts.room) return { text: full, held: manual.map(one => one.name) }

  /**
   * 🛑 The MANUALS give ground FIRST, and the order is the whole lesson of 2026-08-31: they are
   * the only block a chain can ask back (`withLoaded`), and the only one worth 24 000 characters.
   * What is in front of the person is worth a few hundred and cannot be asked back at all —
   * dropped for them, the bench lost six points and 227 turns to refusals.
   *
   * By whole actions and from the FRONT: what a chain opened last is what it is about to call,
   * and half a field line is an action the model cannot see is truncated.
   */
  const blocks = manualsWithin(manual, full.length - parts.room)
  const held = blocks.map(one => one.name)
  const manuals = manualText(blocks)
  const thinner = composed(one, manuals, found, state, targets)
  if (thinner.length <= parts.room) return { text: thinner, held }

  // Then the state, whose lines are ranked from the most useful — it is prose, and it gives by
  // whole lines where the blocks above gave by whole actions.
  const short = linesWithin(state, Math.max(0, state.length - (thinner.length - parts.room)))
  const trimmed = composed(one, manuals, found, short, targets)
  if (trimmed.length <= parts.room) return { text: trimmed, held }

  /**
   * Then the TAIL of the target list, which is the loss the window already designed for: it ranks
   * them selection first, then the names the sentence spells, then the rest.
   */
  const aimed = targetsWithin(targets, trimmed.length - parts.room)
  const cut = composed(one, manuals, found, short, aimed)
  if (cut.length <= parts.room) return { text: cut, held }

  /**
   * 🛑 Then the project context — a FOURTH step because the two above can both run out: the state
   * is cut by whole lines and the targets by whole entries, so a saturated briefing settles a
   * couple of dozen characters over the room with nothing left to give.
   */
  return { text: finalBriefing(one, manuals, found, short, aimed, cut), held }
}

function targetsWithin(targets: readonly Target[], over: number): readonly Target[] {
  let dropped = 0
  let saved = 0
  while (saved < over && dropped < targets.length) {
    saved += targetLine(targets[targets.length - 1 - dropped] as Target).length + 1
    dropped += 1
  }

  return targets.slice(0, targets.length - dropped)
}

const MANUAL_HEAD = 'Manual — the fields of the actions opened so far:'

function composed(
  one: Composition,
  manual: string,
  found: string,
  state: string,
  targets: readonly Target[],
): string {
  const parts = one.parts
  return [
    roleWith(one.rules),
    '',
    ...labelled(parts.mission ? 'Mission:' : 'Project context:', parts.context),
    ...labelled('Folders on this machine:', parts.folders),
    ...plain(state),
    ...notReadyLines(parts.notReady),
    'Catalogue:',
    namesPrinted(),
    '',
    ...labelled(MANUAL_HEAD, manual),
    ...labelled('Targets in the open document:', targets.map(targetLine).join('\n')),
    ...plain(found),
    ...plain(parts.continuing ? CONTINUING : ''),
    parts.tools ? TOOL_FORMAT : FORMAT,
  ].join('\n')
}

const plain = (value: string): readonly string[] => (value === '' ? [] : [value, ''])

const labelled = (label: string, value: string | undefined): readonly string[] =>
  value ? [label, value, ''] : []

const notReadyLines = (workspaces: readonly string[] | undefined): readonly string[] =>
  workspaces && workspaces.length > 0 ? [`No model ready for: ${workspaces.join(', ')}.`, ''] : []

/** What the memory costs a briefing, and only where there is something to find. */
const memorySignal = (parts: BriefingParts): readonly string[] =>
  (parts.memories ?? 0) > 0 ? [MEMORY_CALL] : []

/**
 * The briefing with the signal, or without it when it does not FIT.
 *
 * 🛑 It yields to OVERRUNNING alone, and to nothing else: the manuals give ground first and every
 * real door cuts some, so yielding to a cut manual dropped this line from every door under
 * ~97 400 — measured 2026-08-31. What it costs there is the WORST-ranked manual of a queue of 283.
 */
function composedWithSignal(one: Composition, manual: readonly Manual[], found: string): Written {
  const signal = memorySignal(one.parts)
  if (signal.length === 0) return briefingText(one, manual, found)

  const written = briefingText({ ...one, rules: [...one.rules, ...signal] }, manual, found)
  if (written.text.length <= one.parts.room) return written

  // Retried only where the signal is what tipped it over: a briefing over by thousands is over
  // for another reason, and composing it a second time to learn that is waste.
  return written.text.length - one.parts.room > signal.join('\n').length + 1
    ? written
    : briefingText(one, manual, found)
}

/** One briefing's whole decision: the parts, which rules it was given, and what it may fall to. */
type Composition = {
  readonly parts: BriefingParts
  readonly rules: readonly string[]
  readonly narrow: (() => Briefing) | null
  /** Set once a query has been answered: an expansion of an expansion talks to itself. */
  readonly found?: string
}

const withParts = (one: Composition, patched: Partial<BriefingParts>): Composition => ({
  ...one,
  parts: { ...one.parts, ...patched },
})

/**
 * 🛑 The names asked for go to the BACK, even ones already there: the cut bites from the front,
 * so `loadedWith` — which dedupes by keeping the position — let a manual that was asked for be
 * cut a second time, and the loop asked for it again until the budget ran out.
 */
const atBack = (
  held: readonly ActionName[],
  names: readonly ActionName[],
): readonly ActionName[] => [...held.filter(name => !names.includes(name)), ...names]

const askedFor = (one: Composition, names: readonly ActionName[]): Composition =>
  withParts(one, {
    loaded: atBack(one.parts.loaded ?? [], names),
    // 🛑 The same move, and `loadedWith` was the wrong one: it dedupes by KEEPING the position, so
    // a re-asked manual crossed the turn boundary still at the front, where the next cut took it.
    opened: atBack(one.parts.opened ?? [], names).slice(-MOST_LOADED),
  })

function briefingOf(one: Composition): Briefing {
  const asked = one.parts.loaded ?? []
  /**
   * 🛑 What the text CARRIES, never what was asked for: the manuals give ground first, so a room
   * too tight prints a share of them. Reported as asked, `unloadedIn` sees nothing to reopen and
   * the call goes out on guessed fields — 40 asked, 7 printed, and every gate green.
   */
  const written = composedWithSignal(one, manualPrinted(asked), one.found ?? '')
  const held = new Set(written.held)
  /**
   * 🛑 Two readings, and confusing them costs a turn: `unloadedIn` asks for what has FIELDS, so
   * everything printed; the boundary must return only what the CHAIN asked for, or 283 names
   * cross it every turn. Without `opened`, the caller IS the chain.
   */
  const opened = (one.parts.opened ?? asked).filter(name => held.has(name))
  return {
    text: written.text,
    loaded: written.held,
    opened,
    withLoaded: names => briefingOf(askedFor(one, names)),
    expand: one.found === undefined ? query => expandedWith(one, query) : null,
    narrow: one.narrow,
  }
}

/**
 * Everything but the person's sentence, sized to the room the brain has: the names of every action
 * whatever the door, and as many rules as the room holds. Nothing here names a cloud or a runtime.
 */
export function studioBriefing(parts: BriefingParts): Briefing {
  const narrow = (): Briefing => narrowBriefing(parts)
  // The rules alone settle it, and settle it without composing: a door too tight for them keeps
  // its state and its context instead, which are what the wide set would take.
  if (parts.room < wideFloor()) return narrow()

  const wide = briefingOf({ parts, rules: rulesFor(WIDE_ALL, parts), narrow })

  return wide.text.length > parts.room ? narrow() : wide
}

const WIDE_ALL: readonly string[] = [...RULES, ...WIDE_RULES]

/** The mission rules ride with BOTH sets: a door too tight for the wide ones still reads a JSON. */
const rulesFor = (rules: readonly string[], parts: BriefingParts): readonly string[] =>
  parts.mission ? [...rules, ...MISSION_RULES] : rules

/**
 * The room the wide rules ASK FOR: their own bare briefing, plus what has to fit beside it — the
 * studio's state, the project context, and three manuals at the registry's own average.
 *
 * 🛑 The reserve is the whole point and it is measured: budgeted on the bare cost alone,
 * Scenario's door took the wide set at 8 364 of its 8 500 and then dropped its state, its context
 * and every manual to fit — a briefing that can never open a field.
 */
let floorHeld: number | null = null

const wideFloor = (): number =>
  (floorHeld ??=
    composed({ parts: { room: 0 }, rules: WIDE_ALL, narrow: null }, '', '', '', []).length +
    STATE_MAX +
    CONTEXT_COMPOSED_MAX +
    3 * meanManual())

/** What one manual typically costs — read off the registry, never written down. */
const meanManual = (): number =>
  Math.ceil(
    ACTION_REGISTRY.reduce((sum, one) => sum + actionBlock(one).length + 1, 0) /
      ACTION_REGISTRY.length,
  )

function narrowBriefing(declared: BriefingParts): Briefing {
  return briefingOf({
    parts: { ...declared, room: declared.fallbackRoom ?? declared.room },
    rules: rulesFor(RULES, declared),
    narrow: null,
  })
}

/** Built once outside retries, so a complaint quotes the briefing it actually answers. */
export async function briefingFor(
  request: AssistantThought,
  room: number,
  notReady?: () => Promise<readonly string[]>,
  fallbackRoom = room,
  tools = false,
): Promise<Briefing> {
  return studioBriefing({
    continuing: request.continuing === true,
    tools,
    notReady: await notReady?.(),
    context: request.context,
    folders: request.folders,
    memories: request.memories,
    state: request.state,
    targets: request.targets,
    /**
     * 🛑 EVERY manual, and the room decides how many survive — `briefingText` cuts them first
     * and `loaded` reports what it printed, so a narrow door asks the rest back. Measured
     * 2026-08-31 over the 437 scenarios of `pnpm banc`: opened on demand instead, the same
     * scenarios passed 56% against 65%, and reached 214 actions against 243.
     *
     * 🛑 A mission opens the CANDIDATES' manuals alone, and never narrows the names: shown 12
     * names of 283, the model could not ask for what it did not know existed — 55 of 440
     * scenarios never had the expected action among the candidates (measured 2026-09-05).
     */
    loaded: request.candidates
      ? [...new Set([...request.candidates, ...(request.loaded ?? [])])]
      : withChainLast(request.loaded ?? []),
    opened: request.loaded ?? [],
    mission: request.mission === true,
    room,
    fallbackRoom,
  })
}

/**
 * Every manual, with the ones the chain asked for LAST: `briefingText` cuts from the front, so
 * what was asked for is what survives a room too tight to hold them all.
 */
const withChainLast = (opened: readonly ActionName[]): readonly ActionName[] => [
  ...ACTION_REGISTRY.map(one => one.name).filter(name => !opened.includes(name)),
  ...opened,
]

const actionsCounted = (many: number): string => (many === 1 ? '1 action' : `${many} actions`)

const foundHeader = (query: string): string =>
  `The manual above holds every action matching "${query}". Call one rather than asking again.`

const nothingFound = (query: string): string =>
  `Nothing in the catalogue matches "${query}". Say so rather than inventing an action.`

/**
 * 🛑 NOT the same sentence as `nothingFound`, and the difference is the whole point: a door whose
 * room barely covers the names plus a full project context has NOTHING left, so not one matched
 * manual fits. Told "nothing matches", the model says so to the person, about actions that exist.
 */
const noRoomFound = (query: string, matched: number): string =>
  `The catalogue has ${actionsCounted(matched)} matching "${query}", and this briefing has no ` +
  `room for the fields. Say so rather than guessing at one.`

/** The middle of the two above: a narrow door describes a share, and the rest stay out of reach. */
const partlyFound = (query: string, kept: number, matched: number): string =>
  `The manual above holds ${kept} of the ${actionsCounted(matched)} matching "${query}", and has ` +
  `no room for the rest. Call one of those rather than guessing at another.`

/**
 * 🛑 Counted on `matched` throughout, never on what was left to OPEN: a wide door prints every
 * manual from the start, so nothing is ever left to open — and read that way the block said
 * "nothing matches" about 28 actions described three lines above (measured 2026-08-31).
 */
const foundBlock = (query: string, matched: readonly ActionName[], kept: number): string => {
  if (matched.length === 0) return nothingFound(query)
  if (kept === 0) return noRoomFound(query, matched.length)

  return kept < matched.length ? partlyFound(query, kept, matched.length) : foundHeader(query)
}

/**
 * 🛑 The LONGEST sentence this block can end on. Counted against a shorter one, the delivered text
 * holds one manual FEWER than announced — 946 lying rooms measured 2026-08-31, telling the model
 * to call one of a set it cannot read. Against this one the count can only understate.
 */
const widestFound = (query: string, matched: readonly ActionName[]): string =>
  [
    foundHeader(query),
    noRoomFound(query, matched.length),
    partlyFound(query, matched.length, matched.length),
  ].reduce((one, other) => (one.length >= other.length ? one : other))

/**
 * The same briefing with what one query found opened, cut to the room by whole ACTIONS.
 *
 * Cut by blocks rather than by characters: half a field line is an action the model cannot call
 * and cannot see is truncated, which is the one failure this whole mechanism exists to avoid.
 */
function expandedWith(one: Composition, query: string): Briefing {
  const matched = findActions(query).map(action => action.name)
  if (matched.length === 0) return briefingOf({ ...one, found: nothingFound(query) })

  /**
   * 🛑 ALL of them to the back, not merely the ones missing: a match already printed stays where
   * the cut can take it, so asking about a topic printed FEWER of its manuals than not asking —
   * 16 rooms between 20 000 and 30 000. And only `askedFor` fills `opened`, so a match that was
   * already held never crossed back and the chain rediscovered it every turn.
   *
   * Worst to best, because the cut keeps the TAIL: the other way round, what room was left
   * described the poorest answers.
   */
  const opened = [...matched].reverse()
  const expanded = askedFor(one, opened)
  const widest = widestFound(query, matched)
  const probe = briefingOf({ ...expanded, found: widest })
  const kept = matched.filter(name => probe.loaded.includes(name)).length
  const found = foundBlock(query, matched, kept)
  if (found === widest) return probe

  // 🛑 The room the count was taken in, kept: composed against its own shorter footer the text
  // frees one more manual, and the sentence then says "no room for their fields" about a manual
  // printed above it — eight rooms measured 2026-08-31.
  const spare = widest.length - found.length

  return briefingOf({ ...withParts(expanded, { room: expanded.parts.room - spare }), found })
}

/**
 * A briefing and a sentence as ONE field, for the door that takes an instruction rather than
 * turns — see `brainProvider`. The cap falls on the sentence: trimming the end would take off
 * the very sentence the person typed and leave the catalogue intact, which is exactly backwards.
 */
export function instructionFor(briefing: string, utterance: string, ceiling: number): string {
  const preamble = preambleOf(briefing)
  return preamble + utterance.slice(0, Math.max(0, ceiling - preamble.length))
}

// A function keeps model text outside the screen-text guard's name binding.
const preambleOf = (briefing: string): string => `${briefing}\n\nThe person says:\n\n`

export const PREAMBLE_COST = preambleOf('').length
