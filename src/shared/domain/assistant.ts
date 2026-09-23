import { defined } from '../guards'
import type { Target } from './target'
import { type ActionCommitment, type ActionName, type AssistantAction } from './assistantAction'
import type { AssistantAsk } from './assistantAsk'
import type { ActionCapabilities } from './actionCapabilities'
import type { ActionReach } from './actionReach'
import { ASSET_ACTIONS } from './assetActions'
import { CANVAS_ACTIONS } from './canvasActions'
import { CLOUD_ACTIONS } from './cloudActions'
import { CORE_ACTIONS } from './coreActions'
import { FILE_ACTIONS } from './fileActions'
import { GIT_ACTIONS } from './gitActions'
import { JOB_ACTIONS } from './jobActions'
import { MATERIAL_ACTIONS } from './materialActions'
import { RIG_ACTIONS } from './rigActions'
import { POST_ACTIONS } from './postActions'
import { SCENE_ACTIONS } from './sceneActions'
import { SEQUENCE_ACTIONS } from './sequenceActions'
import { CONTEXT_ACTIONS } from './contextActions'
import { MEMORY_ACTIONS } from './memoryActions'
import {
  ASSEMBLY_ACTIONS,
  EXPORT_ACTIONS,
  GAME_ACTIONS,
  PLAY_ACTIONS,
  SCRIPT_ACTIONS,
  STUDIO_ACTIONS,
  TIMELINE_ACTIONS,
} from './gameActions'
import { SETTINGS_ACTIONS } from './settingsActions'
import { SHELL_ACTIONS } from './shellActions'
import { TARGET_ACTIONS } from './targetActions'
import { STATE_ACTIONS } from './stateActions'
import { PROJECT_ACTIONS } from './projectActions'
/**
 * What the assistant is allowed to do on the user's behalf, and how each thing is described to
 * the model that chooses it — see spec § 9.
 *
 * One table, read by two surfaces that must never disagree: the assistant inside the window,
 * which is shown every NAME and asks for the manuals it needs — `studioBriefing` — and the MCP
 * server, which publishes all of it as tools.
 */
export * from './assistantAction'
export * from './actionCapabilities'
export * from './actionReach'
export * from './assistantModel'
export * from './actionResource'

export { commitmentOfCommand } from './coreActions'

function actionsWithCapabilities(
  actions: readonly AssistantAction[],
  capabilities: ActionCapabilities,
): readonly AssistantAction[] {
  return actions.map(entry => ({
    ...entry,
    capabilities: { ...capabilities, ...entry.capabilities },
  }))
}

/**
 * Every action the studio publishes, one family after another.
 *
 * Order matters to one reader only — the assistant's model reads its share in this order — so
 * the spoken vocabulary comes first and the families a program drives follow.
 *
 * 🛑 The families are DATA, not a spread: the briefing heads its catalogue with them, and read
 * off the first token of a name instead it cut 231 actions into 83 headings that grouped nothing
 * — two actions of different families shared a heading.
 */
export const ACTION_FAMILIES: readonly ActionFamily[] = [
  { name: 'core', actions: CORE_ACTIONS },
  { name: 'target', actions: TARGET_ACTIONS },
  { name: 'state', actions: STATE_ACTIONS },
  { name: 'file', actions: FILE_ACTIONS },
  { name: 'job', actions: JOB_ACTIONS },
  { name: 'asset', actions: ASSET_ACTIONS },
  { name: 'cloud', actions: CLOUD_ACTIONS },
  {
    name: 'canvas',
    actions: actionsWithCapabilities(CANVAS_ACTIONS, {
      documentKinds: ['image'],
      documentAffinity: 'required',
    }),
  },
  {
    name: 'montage',
    actions: actionsWithCapabilities(SEQUENCE_ACTIONS, {
      documentKinds: ['sequence'],
      documentAffinity: 'required',
    }),
  },
  {
    name: 'material',
    actions: actionsWithCapabilities(MATERIAL_ACTIONS, {
      documentKinds: ['material'],
      documentAffinity: 'required',
      targets: ['document'],
    }),
  },
  {
    name: 'scene',
    actions: actionsWithCapabilities(SCENE_ACTIONS, {
      documentKinds: ['scene'],
      documentAffinity: 'required',
    }),
  },
  {
    name: 'post',
    actions: actionsWithCapabilities(POST_ACTIONS, {
      documentKinds: ['scene'],
      documentAffinity: 'required',
    }),
  },
  {
    name: 'rig',
    actions: actionsWithCapabilities(RIG_ACTIONS, {
      documentKinds: ['scene', 'character'],
      documentAffinity: 'required',
    }),
  },
  { name: 'git', actions: GIT_ACTIONS },
  {
    name: 'game',
    actions: actionsWithCapabilities(GAME_ACTIONS, {
      documentKinds: ['scene'],
      documentAffinity: 'required',
      targets: ['node'],
    }),
  },
  { name: 'play', actions: PLAY_ACTIONS },
  {
    name: 'script',
    actions: actionsWithCapabilities(SCRIPT_ACTIONS, { documentAffinity: 'transversal' }),
  },
  { name: 'studio', actions: STUDIO_ACTIONS },
  {
    name: 'timeline',
    actions: actionsWithCapabilities(TIMELINE_ACTIONS, {
      documentKinds: ['scene'],
      documentAffinity: 'required',
      targets: ['timeline'],
    }),
  },
  { name: 'assembly', actions: ASSEMBLY_ACTIONS },
  { name: 'export', actions: EXPORT_ACTIONS },
  { name: 'project', actions: PROJECT_ACTIONS },
  {
    name: 'context',
    actions: actionsWithCapabilities(CONTEXT_ACTIONS, { targets: ['projectContext'] }),
  },
  { name: 'memory', actions: actionsWithCapabilities(MEMORY_ACTIONS, { targets: ['memory'] }) },
  { name: 'settings', actions: SETTINGS_ACTIONS },
  { name: 'shell', actions: SHELL_ACTIONS },
]

/** One family of the registry: what a briefing heads a run of actions with. */
export type ActionFamily = { readonly name: string; readonly actions: readonly AssistantAction[] }

/** Derived, never restated: a family added above is in the registry on the spot. */
export const ACTION_REGISTRY: readonly AssistantAction[] = ACTION_FAMILIES.flatMap(
  family => family.actions,
)

/**
 * What one door carries: what is marked for it, plus what every door shares.
 *
 * 🛑 Marked-for-it and never a fallback: publishing EVERYTHING by default is what would send a
 * third reach out on the MCP wire with nothing red.
 */
export function actionsReaching(reach: ActionReach): readonly AssistantAction[] {
  return ACTION_REGISTRY.filter(entry => entry.reach === 'both' || entry.reach === reach)
}

/**
 * The action a brain answers ITSELF, to open the manuals a WORD points at where the model cannot
 * name what it needs — see `answeredTurn`. Named here because two modules must leave it out of
 * what they search, and a name spelled twice is a name that drifts.
 */
export const DISCOVERY_ACTION: ActionName = 'actions.find'

/**
 * 🛑 How many manuals one chain may carry, and it is a BOUND on the briefing rather than a taste:
 * the window names them, so without this a renderer could grow the catalogue block without limit.
 */
export const MOST_LOADED = 40

/**
 * What a chain carries forward: the manuals already open, plus what the last round opened.
 *
 * The NEWEST survive the cap: what a round has just asked for is what it is about to call.
 */
export function loadedWith(
  held: readonly ActionName[],
  added: readonly ActionName[],
): readonly ActionName[] {
  return [...held, ...added.filter(name => !held.includes(name))].slice(-MOST_LOADED)
}

/** One thing the assistant decided to do. Checked against the registry before it is run. */
export type AssistantCall = { action: ActionName; input: Record<string, unknown> }

export type AssistantImage = {
  mimeType: 'image/png' | 'image/jpeg'
  bytes: Uint8Array
}

/** What is asked of whatever does the thinking. */
export type AssistantThought = {
  utterance: string
  /**
   * This is not the first round on this sentence: what has already been done, and what each
   * action answered, is in `history`.
   *
   * The window's to say, because the chain is the window's: it is what turns "search, then open
   * what you found" into two rounds instead of one plan that cannot be written in advance.
   */
  continuing?: boolean
  /**
   * The turns before this one, oldest first, already rendered as lines. Rendered rather than
   * structured because that is what a model reads, and because the implementation the studio
   * ships can only carry ten blocks of text.
   */
  history: readonly string[]
  images?: readonly AssistantImage[]
  /**
   * What the open project is about, already composed — see `composedContext`.
   *
   * 🛑 Filled in the MAIN process, never by a window: `parseThought` does not declare it, so zod
   * strips one that arrived over the boundary. A context a renderer could name is a context a
   * renderer could forge.
   */
  context?: string
  /**
   * What the studio is right now — the space, the document in front, the model armed, what is
   * selected — already in sentences. See `describeStudio`.
   *
   * 🛑 Filled in the MAIN process, by the same route and for the same reason as `context`: it is
   * ASKED of the window in front, through the door an MCP client reads `studio.state` by, rather
   * than taken from whatever a renderer chose to send.
   */
  state?: string
  /**
   * How many memories this project holds — see `assistantMemory.ts`.
   *
   * 🛑 A COUNT and not the memories: what a briefing says is that a memory EXISTS and how to ask
   * it, never what it holds. Filled in the MAIN process, by the same route and for the same
   * reason as `context` and `state`: `parseThought` does not declare it, so zod strips one that
   * arrived over the boundary.
   */
  memories?: number
  /**
   * Where this machine keeps a person's folders, absolute — `project.create` and `project.open`
   * take an absolute path (`fileActions.ts`) and nothing else in the briefing spells one, so a
   * model shown neither asked for the login name instead of acting.
   *
   * 🛑 Filled in the MAIN process, for the same reason as `context` and `state`: a renderer that
   * could name a path is a renderer that could aim one.
   */
  folders?: string
  /**
   * What the open document can be aimed at, narrowed by the window — see `target.ts`.
   *
   * Unlike `context` and `state` this one IS the renderer's to name: it describes its own window,
   * and every id is checked against the live document by the handler before anything moves.
   */
  targets?: readonly Target[]
  /**
   * The actions whose MANUAL — description and fields — the briefing already carries in this
   * chain. The catalogue itself is names alone, so this is what the model can actually fill in.
   *
   * 🛑 The window's to say, unlike `context` and `state`: what one round opened has to survive
   * into the next, and the main process keeps nothing between two turns. Declared and BOUNDED in
   * `parseThought` — a field the schema does not name is stripped, and one it does not bound is a
   * briefing a renderer can inflate. Unknown names are dropped rather than refused.
   */
  loaded?: readonly ActionName[]
  /** ActionIndex candidates whose MANUALS a mission turn opens. Absent on the legacy conversation. */
  candidates?: readonly ActionName[]
  /**
   * A mission turn: `context` is then the mission JSON, which the briefing labels and explains.
   * Never read from the window — `parseThought` names no such field, so a renderer cannot set it.
   */
  mission?: boolean
}

/**
 * What a turn is writing, as it writes it — the frames a window shows while the model works.
 *
 * Shared because it crosses the boundary unchanged: the runtime that produces it, the brain that
 * relays it and the window that renders it read the same shape, and a second one would drift.
 */
export type AssistantProgress = {
  /** What the model just wrote, to be appended. Empty on a frame that carries only the counts. */
  delta: string
  /** What the prompt cost. Absent until the door says, which is at the end of the answer. */
  promptTokens?: number
  /**
   * What the prompt carried in CHARACTERS, for a door bounded in characters rather than in
   * tokens — Scenario's `instruction` field is one. Never comparable to `promptTokens`.
   */
  promptChars?: number
  /** What the answer has cost. Absent for a door that counts nothing. */
  replyTokens?: number
  /**
   * What the door reads in one go, so `promptTokens` can be read as a share of it. Absent for a
   * door that names no window — the window then shows the count alone rather than a wrong ratio.
   */
  windowTokens?: number
  /**
   * A new attempt is starting: what was shown so far belongs to an answer that was thrown away.
   * One sentence may cost four round trips (`TURN_ATTEMPTS`), and appending them reads as one
   * long answer contradicting itself.
   */
  restart?: boolean
}

/**
 * What the door in front reads in ONE go — asked BEFORE a turn, so the composer can show the
 * bound with nothing typed yet. `null` from a door that names none, which the screen says rather
 * than dresses up as a ratio.
 *
 * 🛑 The unit is part of the answer and is never assumed: Scenario bounds its `instruction` field
 * in CHARACTERS while a local runtime bounds its window in TOKENS, and reading one against the
 * other is exactly the `2 067 / 4 096` once shown for DeepSeek — a briefing budget worn as a
 * window.
 */
export type AssistantWindow = {
  size: number
  unit: 'tokens' | 'characters'
  /** True when the figure is a DECLARED fallback, the door having failed to read its own. */
  assumed: boolean
}

/**
 * 🛑 Nothing to report is `null`, never an empty frame: a door sends protocol frames of its own —
 * `ping`, `content_block_start`, `message_stop` — and each one relayed is an IPC message and a
 * render for no words.
 *
 * 🛑 It counts in TOKENS and knows nothing of `promptChars`: a door bounded by a length composes
 * its own frame, or this would answer `null` for the one frame it has to send.
 */
export const assistantProgress = (
  delta: string,
  promptTokens?: number,
  replyTokens?: number,
): AssistantProgress | null =>
  delta === '' && promptTokens === undefined && replyTokens === undefined
    ? null
    : { delta, ...defined({ promptTokens, replyTokens }) }

export type AssistantAnswer = {
  /** What to say to the person. Empty when the actions speak for themselves. */
  say: string
  /**
   * 🛑 Filled means the turn STOPS: `calls` is empty by construction — `parseReply` refuses an
   * answer that asks and acts at once — and the chain waits for the answer, which enters the
   * history of the round after it.
   */
  ask?: AssistantAsk
  calls: readonly AssistantCall[]
  /**
   * 🛑 Nothing the model sent could be READ, after every attempt: neither a word, a question nor
   * a call. Said here rather than left to be inferred from an empty `say` — a model that had
   * nothing to add answers the same shape, and a mission that planned it as « done » closed
   * « completed » with nothing done.
   */
  unreadable?: true
  /**
   * Which manuals the briefing held by the end of this turn — see `AssistantThought.loaded`.
   *
   * Absent where nothing was opened, which is the ordinary turn. The window hands it back on the
   * next round of the SAME chain and drops it when the chain ends.
   */
  loaded?: readonly ActionName[]
  /**
   * What the turn cost, in creative units.
   *
   * On the answer rather than reported separately: the modal shows a running total, and a figure
   * that arrived by another route would drift from it the first time a call failed halfway.
   */
  cost: number
}

/** Indexed, never scanned: 22 sites ask this, up to forty times per briefing. */
const BY_NAME = new Map<string, AssistantAction>(ACTION_REGISTRY.map(one => [one.name, one]))
export const assistantAction = (name: string): AssistantAction | null => BY_NAME.get(name) ?? null

/**
 * What one particular call would engage, which for `command.runStudioCommand` is a fact of the command named
 * rather than of the action.
 *
 * Shared because both sides ask: the window asks before it acts, and the MCP server asks before
 * it tells a window to. A second copy of this arithmetic is the one that would drift, and it
 * would drift towards spending something without asking.
 */
export function commitmentOfCall(
  name: ActionName,
  input: Record<string, unknown>,
): ActionCommitment {
  const action = assistantAction(name)
  if (!action) return 'none'

  return action.raises?.(input) ?? action.commitment
}
