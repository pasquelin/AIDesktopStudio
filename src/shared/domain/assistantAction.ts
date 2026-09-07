import { HEX_COLOR } from './color'
import type { FieldKind } from './model'
import { ENVIRONMENT_KINDS } from './scene'
import type { ActionReferenceKind, ActionResource } from './actionResource'
/**
 * Every action the studio publishes, in one list.
 *
 * Written out rather than composed from the family modules: the union cannot live beside the
 * tables without those tables importing it back. The compiler holds families → union; only
 * `exhaustive.test.ts` holds union → families, and it has to — a name declared here and never
 * built leaves the registry and the handler table in perfect agreement about nothing.
 */
import type { ActionName } from './assistantActionNames'
import type { ActionCapabilities } from './actionCapabilities'
import type { ActionReach } from './actionReach'
export type { ActionName } from './assistantActionNames'
/**
 * What running an action leaves behind, and therefore whether it may run without being asked.
 *
 * - `none` — undoable, and nothing outlives the window.
 * - `files` — moves, renames or bins something in the project folder, or drops unsaved work.
 *   The Explorer can undo it, but the disk has already changed and another program may have
 *   read it since.
 * - `asset` — uploads a picture, which becomes a permanent asset in the user's library.
 * - `remote` — publishes to a server outside this machine. Costs nothing and destroys nothing
 *   locally, and that is exactly why the other levels do not describe it: what leaves cannot be
 *   called back, and no undo on this machine reaches it.
 * - `studio` — changes what the studio IS beyond the open document: which preferences hold,
 *   which account answers, which project is open. No ⌘Z reaches any of it, and the account is
 *   the one that decides whose library and whose invoice the next generation lands on. It is the
 *   only level with no delegation switch, and that is the point.
 * - `credits` — spends real money. Confirmed, and the estimate is stated first.
 *
 * The distinction matters at the moment of asking: only `credits` has a figure to quote, and
 * inventing one for the others would be worse than admitting there is none.
 *
 * `files` is deliberately narrow — destroying, moving or renaming — and NOT "anything that
 * writes". A new folder and a duplicate add something nobody loses, and a studio that asked
 * about those would teach its user to click Allow without reading.
 */
export type ActionCommitment = 'none' | 'files' | 'asset' | 'remote' | 'studio' | 'credits'
export const ACTION_COMMITMENTS: readonly ActionCommitment[] = [
  'none',
  'files',
  'asset',
  'remote',
  'studio',
  'credits',
]
/**
 * One input of an action.
 *
 * Deliberately NOT `FieldDescriptor`: that one carries `label`, a sentence the Scenario API
 * writes and the form shows as-is. A static registry cannot hold a sentence — every word bound
 * for the screen lives in a bundle — so this carries `labelKey` instead.
 */
export type ActionChoice = string | number | boolean

export type ActionField = {
  key: string
  kind: FieldKind
  labelKey: string
  required: boolean
  /** Closed wire values, never translated labels. */
  options?: readonly ActionChoice[]
  /**
   * What this value NAMES, so a surface can offer to point at one instead of asking for the word.
   * `folder` is a folder of the machine — the model guesses a name where only the person knows
   * where their work lives; `node` is a node of the scene and `script` a file of the project,
   * both of which the inspector offers as a list rather than as a name to type.
   *
   * 🛑 Not `PathKind`: the button's label says « dossier », and nothing would rougir on a field
   * that asked for a FILE under it. A second kind comes with a second label.
   */
  picks?: 'folder' | 'node' | 'script'
  reference?: ActionReferenceKind
  min?: number
  max?: number
  /** A list of `kind` rather than one of it. `raw` stays a single value — it is already open. */
  repeated?: boolean
}

export type AssistantAction = {
  name: ActionName
  titleKey: string
  /** Never optional: an action the model cannot be told the purpose of is one it will misuse. */
  descriptionKey: string
  /** The floor. What one CALL engages may be higher — see `raises`. */
  commitment: ActionCommitment
  /**
   * Whether a SECOND identical call, in one turn, can bring anything the first did not. False is
   * for what sets a surface or a session to a NAMED state; everything else is true, reading
   * included — `jobs.list` answers empty for a generation that has not registered yet, and a
   * model told not to repeat it would stop watching its own.
   *
   * 🛑 Blind spot, assumed: the guard reads this action's own last state and never its OPPOSITE,
   * so open/close/open of one panel — and pause/resume/pause, start/stop/start, pin/unpin/pin —
   * is refused on the third call, with a sentence saying the state stands when it no longer does.
   */
  repeatable: boolean
  /**
   * What this call engages, when its own input decides — a command that uploads, an amend that
   * rewrites a version, a removal that reaches the remote library.
   *
   * On the descriptor rather than as names spelled out in `commitmentOfCall`: that function held
   * one action by name, and the two others that needed it silently did not get it.
   */
  raises?: (input: Record<string, unknown>) => ActionCommitment
  /**
   * The handler may put its own question on screen and wait for a person — whether it does is the
   * handler's own business (a dirty document, a missing title). `commitment` stays at the floor so
   * no SECOND question is raised, which is what made the tool announce "Runs straight away".
   */
  asksItself?: true
  /**
   * This one RUNS other actions, so an answer takes as long as everything it holds — pricing and
   * questions included. Read by `asking.ts`, which owes it the long wait, and by `tools.ts`.
   */
  runsOthers?: true
  reach: ActionReach
  fields: readonly ActionField[]
  requires?: readonly ActionResource[]
  produces?: readonly ActionResource[]
  inputs?: readonly ActionResource[]
  /** A resource that improves this action but whose absence does not prevent a direct call. */
  uses?: readonly ActionResource[]
  returns?: readonly ActionResource[]
  capabilities?: ActionCapabilities
}

export function action(descriptor: AssistantAction): AssistantAction {
  return descriptor
}
/** The node in front, named the same way in every family that points at one. */
export const NODE_ID: ActionField = {
  key: 'nodeId',
  kind: 'text',
  labelKey: 'assistant.fields.nodeId',
  required: true,
  picks: 'node',
  reference: 'node',
}

/** How one works on a channel or a row — the same three flags, two families. */
export const MUTE_SOLO_LOCK: readonly ActionField[] = [
  { key: 'muted', kind: 'boolean', labelKey: 'assistant.fields.muted', required: false },
  { key: 'solo', kind: 'boolean', labelKey: 'assistant.fields.solo', required: false },
  { key: 'locked', kind: 'boolean', labelKey: 'assistant.fields.locked', required: false },
]

/**
 * What lights a surface, as the two registries that ask it both name it: a PICTURE by asset id,
 * a sky DOCUMENT by title. Naming one is enough — a document lit by an asset is `skybox` by that
 * fact alone, which spares a client two calls to do one thing. A document id is not something
 * anyone types, hence the TITLE.
 *
 * Written once because a fourth arm of `EnvironmentRef` would otherwise have to be added to two
 * registries, and nothing holds them together.
 */
export const ENVIRONMENT_FIELDS: readonly ActionField[] = [
  {
    key: 'kind',
    kind: 'choice',
    labelKey: 'assistant.fields.environmentKind',
    required: false,
    options: ENVIRONMENT_KINDS,
  },
  { key: 'assetId', kind: 'text', labelKey: 'assistant.fields.assetId', required: false },
  { key: 'sky', kind: 'text', labelKey: 'assistant.fields.skyDocument', required: false },
]

/**
 * 🛑 What turns « d'un mètre vers le haut » into one call instead of three.
 *
 * Without it a caller has to read the pose, do the arithmetic and write the result — measured on
 * the bench pass of 2026-08-26, section 7 scored 0 on five requests, every one of them written
 * as an absolute. The field's own label carries the rule, since that is what a model reads.
 */
export const RELATIVE_FIELD: ActionField = {
  key: 'relative',
  kind: 'boolean',
  labelKey: 'assistant.fields.relative',
  required: false,
}

/**
 * Why an action did not run.
 *
 * Shared rather than private to the executor, because the sentence is read twice and in two
 * languages: the person watching the modal reads their own, and the model deciding what to try
 * next reads English. Both renderings come from the bundles.
 */
export type ActionRefusal =
  | 'unknownCommand'
  /** No surface mounted to take it — a scope with no panel up, a save with no tab in front. */
  | 'wrongSurface'
  | 'generatorClosed'
  | 'nothingPrepared'
  | 'notSubmitted'
  | 'badInput'
  | 'noBridge'
  /** A path is relative to a project, and there is none open to be relative to. */
  | 'noProject'
  /** Nobody was there to be asked — see `runConfirmedAction`. Never a silent yes. */
  | 'noConfirmer'
  | 'declined'
  /** No window at the front to act at all. Only an action arriving from outside can meet this. */
  | 'noWindow'
  /** The question stood on screen and nobody answered it. Same reason, same one caller. */
  | 'timedOut'
  /** Nothing to read a style from: the form carries no reference picture. */
  | 'noReference'
  /**
   * Two destinations, and the studio would have asked. Named rather than guessed: the wrong one
   * writes over a file somebody is editing — the options travel in the outcome's `data`.
   */
  | 'ambiguousLanding'
  /** The form moved between the figure being quoted and the yes. What was priced is what goes. */
  | 'formChanged'
  /** Well formed, and its target is not there. A client told `badInput` retries the parameters. */
  | 'notFound'
  /** A call from outside may not do this at all. Never a person's refusal — that is `declined`. */
  | 'notAllowed'
  /**
   * The command raises a native picker, which nothing here can fill or read back.
   *
   * 🛑 Its own reason and never `notAllowed`, whose sentence says "an appeal from outside": the
   * caller refused was the WINDOW's own assistant, and a refusal that misnames who was refused
   * teaches the model nothing it can act on. This one names the way through instead.
   */
  | 'nativeDialog'
  /** The document in front carries nothing to render. Three causes, one honest answer. */
  | 'notRenderable'
  /**
   * A call from the wire that engages something, met without a consent token. `detail` carries a
   * fresh one and what it covers, and the same call sent back with it runs.
   *
   * 🛑 The blind spot, and it is not closable from this side: the token proves the caller was
   * TOLD what the call engages, never that a person agreed. What it buys is that nothing engages
   * by accident, and that every engagement is named once in the open before it happens.
   */
  | 'needsConsent'
  /** It was tried and it did not go through. The journal holds the reason; the input was not it. */
  | 'failed'

export const ACTION_REFUSALS: readonly ActionRefusal[] = [
  'unknownCommand',
  'wrongSurface',
  'generatorClosed',
  'nothingPrepared',
  'notSubmitted',
  'badInput',
  'noBridge',
  'noProject',
  'noConfirmer',
  'declined',
  'noWindow',
  'timedOut',
  'noReference',
  'ambiguousLanding',
  'formChanged',
  'notFound',
  'notAllowed',
  'nativeDialog',
  'notRenderable',
  'needsConsent',
  'failed',
]

/**
 * What running an action answered.
 *
 * Shared rather than the window's own, since an action asked for from outside is answered back
 * across the boundary: the MCP server hands this to its client. A refusal carries a key rather
 * than a sentence, for the reason the list above gives — it is read in two languages.
 */
export type ActionOutcome =
  | { ok: true; data?: unknown }
  /**
   * `detail` says WHAT was wrong, in English and for a machine — never for the screen, which
   * reads `refusalKey`. A refusal that names nothing is one a caller cannot repair: measured on
   * the bench pass of 2026-08-25, 384 calls were sent again word for word after a refusal.
   */
  | { ok: false; refusal: ActionRefusal; detail?: string }

export function refusalKey(refusal: ActionRefusal): string {
  return `assistant.refusals.${refusal}`
}

/**
 * The sentence a commitment is announced with. Keyed rather than branched on, so a fifth level
 * cannot fall silently into the wrong question — which a chain of `if` in the modal would let it.
 */
export function confirmKey(commitment: ActionCommitment): string {
  return `assistant.confirm.${commitment}`
}

export function needsConfirmation(commitment: ActionCommitment): boolean {
  return commitment !== 'none'
}

export const refused = (refusal: ActionRefusal, detail?: string): ActionOutcome => ({
  ok: false,
  refusal,
  ...(detail === undefined ? {} : { detail }),
})

/**
 * What each kind accepts, as a check rather than as a name.
 *
 * A required `text` may not be blank, and a required `repeated` may not be empty — see
 * `validatesInput`. Both were left to the handlers first, which meant one `=== ''` and one
 * `length === 0` per action, and a handler that forgot either had nothing behind it.
 *
 * 🛑 A PLACEHOLDER is refused here rather than explained later: `inputProblem` only speaks once
 * something else has already refused, so a lone `<path_id>` used to reach the handler and come
 * back as `notFound` — a hunt for a node whose name was never a name.
 */
const withinLength = (field: ActionField, value: string): boolean =>
  (field.min === undefined || value.length >= field.min) &&
  (field.max === undefined || value.length <= field.max)

function fits(field: ActionField, value: unknown): boolean {
  switch (field.kind) {
    case 'text':
    case 'longText':
    case 'image':
    case 'mesh':
    case 'task':
      return fitsText(field, value)
    case 'choice':
      return (
        (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') &&
        (field.options?.some(option => option === value) ?? true)
      )
    case 'color':
      return typeof value === 'string' && HEX_COLOR.test(value)
    case 'number':
    case 'integer':
    case 'seed':
      return fitsNumber(field, value)
    case 'boolean':
      return typeof value === 'boolean'
    case 'raw':
      return value !== undefined
    case 'record':
      return fitsRecord(field, value)
  }
}

function fitsText(field: ActionField, value: unknown): boolean {
  return (
    typeof value === 'string' &&
    (!field.required || value.trim() !== '') &&
    !PLACEHOLDER.test(value) &&
    (!field.options || field.options.includes(value)) &&
    withinLength(field, value)
  )
}

function fitsNumber(field: ActionField, value: unknown): boolean {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    (field.kind === 'number' || Number.isInteger(value)) &&
    (field.min === undefined || value >= field.min) &&
    (field.max === undefined || value <= field.max)
  )
}

function fitsRecord(field: ActionField, value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).every(key => field.options?.some(option => option === key) ?? true)
  )
}

/**
 * Whether this input may be handed to the action's own code.
 *
 * The one validator for all three callers — the modal, an MCP client, and the reply parser —
 * and it is derived from `fields` rather than written per action, which is what makes eighty
 * actions cost no more to guard than eleven. Before it existed each handler read its own inputs
 * defensively and the ones that forgot were guarded by nothing at all.
 *
 * A key nobody declared is a refusal rather than a value ignored: the schema promises
 * `additionalProperties: false`, and a client that got a silent yes for a misspelt key would
 * believe the value took.
 */
export function validatesInput(
  fields: readonly ActionField[],
  input: Record<string, unknown>,
): boolean {
  for (const key of Object.keys(input)) {
    if (!fields.some(field => field.key === key)) return false
  }

  return fields.every(field => {
    const value = input[field.key]
    if (value === undefined) return !field.required

    if (!field.repeated) return fits(field, value)

    return (
      Array.isArray(value) &&
      (!field.required || value.length > 0) &&
      value.every(item => fits(field, item))
    )
  })
}

/**
 * The input a handler will read, or `null` when it does not fit the registry.
 *
 * 🛑 A lone value fills a `repeated` field. Measured on the bench pass of 2026-08-25: a model
 * writing `assetIds: "asset-4"` was refused `badInput`, learnt nothing from it, and sent the
 * same call again — 18 refusals in one request, on a value that was right.
 */
export function readInput(
  fields: readonly ActionField[],
  input: Record<string, unknown>,
): Record<string, unknown> | null {
  const listed: Record<string, unknown> = { ...input }
  for (const field of fields) {
    const value = listed[field.key]
    if (field.repeated && value !== undefined && !Array.isArray(value)) listed[field.key] = [value]
  }

  return validatesInput(fields, listed) ? listed : null
}

/** How a field is named back to a caller: its key, and what it takes. */
function wants(field: ActionField): string {
  const kind = field.repeated ? `a list of ${field.kind}` : field.kind
  return field.options ? `${kind}, one of: ${field.options.join(', ')}` : kind
}

/**
 * Why this input was refused, for the caller that has to repair it — `null` when nothing is wrong.
 *
 * 🛑 ONE problem, the first found: a list of five reads as a broken call rather than as a field
 * to fix, and the model then rewrites the whole thing instead of the one value.
 */
export function inputProblem(
  fields: readonly ActionField[],
  input: Record<string, unknown>,
): string | null {
  for (const key of Object.keys(input)) {
    if (!fields.some(field => field.key === key)) {
      return `no field "${key}" — this action takes: ${fields.map(one => one.key).join(', ')}`
    }
  }

  for (const field of fields) {
    const value = input[field.key]
    if (value === undefined) {
      if (field.required) return `"${field.key}" is required — ${wants(field)}`
      continue
    }

    if (isEmpty(value)) return EMPTY_VALUE(field.key)
    if (typeof value === 'string' && PLACEHOLDER.test(value))
      return WROTE_PLACEHOLDER(field.key, value)
    if (field.repeated && !Array.isArray(value)) return `"${field.key}" wants ${wants(field)}`
    const items = field.repeated && Array.isArray(value) ? value : [value]
    if (!items.every(item => fits(field, item))) return `"${field.key}" wants ${wants(field)}`
  }

  return null
}

/** `<the id>`, `$ASSET_ID`, `{{path}}` — a shape a caller writes when it has no value to write. */
const PLACEHOLDER = /^(<.*>|\$[A-Z_]+|\{\{.*\}\}|TODO|xxx+)$/i

/**
 * 🛑 It says LOOK FIRST, because the measured case is a model that had already been answered:
 * `projects.list` returned the one project, and the next call still wrote `<CHEMIN_PROJET>`. Told
 * only to run the call that answers it, the model re-ran the listing or gave up and announced the
 * gesture as done — measured on 41.8, 2026-08-31.
 */
const WROTE_PLACEHOLDER = (key: string, value: string): string =>
  `"${key}" reads ${value}, which is a placeholder and not a value. Nothing here fills one in. ` +
  `Read the answer of a call you have ALREADY made this turn and copy the value from it; only if ` +
  `no answer holds it, run the call that answers it and send this one again.`

const isEmpty = (value: unknown): boolean =>
  value === null || value === '' || (Array.isArray(value) && value.length === 0)

/**
 * 🛑 What an EMPTY value is told, and it says what to do rather than what is wrong: measured on
 * the bench pass of 2026-08-26, 41 calls carried a field the caller had not been answered yet —
 * a search and the call reading its result, sent in one breath.
 */
const EMPTY_VALUE = (key: string): string =>
  `"${key}" was empty — you do not have that value yet. Run the call that answers it, ` +
  `then send this one again on the NEXT round with what came back.`
